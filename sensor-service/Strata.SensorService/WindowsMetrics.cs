using System.Management;
using System.Runtime.InteropServices;

namespace Strata.SensorService;

internal sealed class WindowsMetrics : IDisposable
{
    private nint query;
    private readonly List<nint> counters = [];
    private (uint Physical, uint Logical, double Nominal)? topology;
    public void Reset()
    {
        if (query != 0) PdhCloseQuery(query);
        query = 0;
        counters.Clear();
        topology = null;
    }
    public (Reading Physical, Reading Logical, Reading Nominal) Topology(long at)
    {
        try
        {
            if (topology is null)
            {
                using var searcher = new ManagementObjectSearcher("SELECT NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed FROM Win32_Processor");
                using var rows = searcher.Get();
                uint physical = 0, logical = 0; double weighted = 0;
                foreach (ManagementObject row in rows)
                using (row)
                {
                    uint cores = Convert.ToUInt32(row["NumberOfCores"]);
                    physical += cores; logical += Convert.ToUInt32(row["NumberOfLogicalProcessors"]);
                    weighted += Convert.ToDouble(row["MaxClockSpeed"]) * cores * 1e6;
                }
                if (physical == 0 || logical < physical) throw new InvalidDataException("Invalid CPU topology");
                topology = (physical, logical, weighted / physical);
            }
            var t = topology.Value;
            return (Reading.Ready(t.Physical, at), Reading.Ready(t.Logical, at),
                t.Nominal > 0 ? Reading.Ready(t.Nominal, at) : Reading.Missing("Nominal frequency unavailable"));
        }
        catch (Exception e) { return (Reading.Missing(e.Message), Reading.Missing(e.Message), Reading.Missing(e.Message)); }
    }

    public Reading Cached(long at)
    {
        try
        {
            if (query == 0)
            {
                Check(PdhOpenQuery(null, 0, out query));
                foreach (string name in new[] { "Modified Page List Bytes", "Standby Cache Core Bytes", "Standby Cache Normal Priority Bytes", "Standby Cache Reserve Bytes" })
                {
                    Check(PdhAddEnglishCounter(query, @"\Memory\" + name, 0, out nint counter));
                    counters.Add(counter);
                }
            }
            Check(PdhCollectQueryData(query));
            double sum = 0;
            foreach (nint counter in counters)
            {
                Check(PdhGetFormattedCounterValue(counter, 0x400, out _, out var value));
                if (value.Status > 1 || value.Value < 0) throw new IOException("Invalid memory list counter");
                sum += value.Value;
            }
            return Reading.Ready(sum, at);
        }
        catch (Exception e) { Reset(); return Reading.Missing(e.Message); }
    }

    public Reading Paging(long at)
    {
        ulong pages = 0; int count = 0; bool overflow = false;
        bool Callback(nint context, ref PageFile info, string name)
        {
            try { pages = checked(pages + (ulong)info.TotalInUse); count++; }
            catch (OverflowException) { overflow = true; }
            return true;
        }
        if (!EnumPageFiles(Callback, 0)) return Reading.Missing("EnumPageFiles failed");
        if (overflow) return Reading.Missing("Pagefile usage overflow");
        return count == 0 ? new("notConfigured", null, at, null) : Reading.Ready(pages * (double)Environment.SystemPageSize, at);
    }
    public Reading SharedLimit(long at)
    {
        var status = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
        return GlobalMemoryStatusEx(ref status) && status.TotalPhysical > 0
            ? Reading.Ready(status.TotalPhysical / 2d, at) : Reading.Missing("Shared GPU memory limit unavailable");
    }
    public object[] Volumes()
    {
        var result = new List<object>();
        foreach (var drive in DriveInfo.GetDrives().OrderBy(d => d.Name, StringComparer.Ordinal))
        {
            try
            {
                if (!drive.IsReady || drive.TotalSize <= 0) continue;
                double total = drive.TotalSize, free = drive.TotalFreeSpace;
                if (free < 0 || free > total) continue;
                string? label = null;
                try { label = string.IsNullOrWhiteSpace(drive.VolumeLabel) ? null : drive.VolumeLabel; } catch (IOException) { }
                result.Add(new { mount = drive.Name.TrimEnd('\\'), label,
                    kind = drive.DriveType switch { DriveType.Fixed => "fixed", DriveType.Removable => "removable", DriveType.CDRom => "optical", DriveType.Ram => "ramdisk", DriveType.Network => "remote", _ => "unknown" },
                    totalBytes = total, freeBytes = free, usedBytes = total - free, percent = (total - free) / total * 100 });
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
        return result.ToArray();
    }

    internal record AdapterInfo(string Name, uint VendorId, uint DeviceId, ulong DedicatedBytes, ulong Luid);
    public static unsafe AdapterInfo Adapter()
    {
        Guid iid = new("770aae78-f26f-4dba-a829-253c83d1b387");
        Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out nint factory));
        try
        {
            AdapterInfo? selected = null;
            var enumerate = (delegate* unmanaged[Stdcall]<nint, uint, nint*, int>)(*(nint**)factory)[12];
            for (uint i = 0; i < 64; i++)
            {
                nint adapter = 0;
                int hr = enumerate(factory, i, &adapter);
                if (hr == unchecked((int)0x887A0002)) break;
                Marshal.ThrowExceptionForHR(hr);
                try
                {
                    AdapterDescription desc;
                    var describe = (delegate* unmanaged[Stdcall]<nint, AdapterDescription*, int>)(*(nint**)adapter)[10];
                    Marshal.ThrowExceptionForHR(describe(adapter, &desc));
                    if ((desc.Flags & 2) != 0) continue;
                    if (selected is not null && selected.DedicatedBytes >= (ulong)desc.DedicatedVideoMemory) continue;
                    selected = new(new string(desc.Description).TrimEnd('\0'), desc.VendorId, desc.DeviceId,
                        (ulong)desc.DedicatedVideoMemory, ((ulong)(uint)desc.Luid.High << 32) | desc.Luid.Low);
                }
                finally { Release(adapter); }
            }
            return selected ?? throw new IOException("No hardware GPU available");
        }
        finally { Release(factory); }
    }
    private static unsafe void Release(nint pointer) => ((delegate* unmanaged[Stdcall]<nint, uint>)(*(nint**)pointer)[2])(pointer);
    public static ulong? DeviceLuid(string? device)
    {
        if (string.IsNullOrEmpty(device)) return null;
        // GenericGpu.DeviceId is a PnP instance ID, not the device-interface
        // path required by D3DKMT. Resolve the exact instance, never VEN/DEV.
        if (!device.StartsWith(@"\\?\", StringComparison.Ordinal))
        {
            Guid arrival = new("1ca05180-a699-450a-9a0c-de4fbe3ddd89");
            if (CM_Get_Device_Interface_List_Size(out uint size, ref arrival, null, 0) != 0 || size > 65536) return null;
            char[] buffer = new char[size];
            if (CM_Get_Device_Interface_List(ref arrival, null, buffer, size, 0) != 0) return null;
            var interfaces = new string(buffer).Split('\0', StringSplitOptions.RemoveEmptyEntries)
                .Where(path => ActualDeviceId(path).Equals(device, StringComparison.OrdinalIgnoreCase)).ToArray();
            var identities = interfaces.Select(DeviceLuid).Where(x => x is not null).Distinct().ToArray();
            return identities.Length == 1 ? identities[0] : null;
        }
        nint name = Marshal.StringToHGlobalUni(device);
        try
        {
            var request = new OpenAdapter { Name = name };
            if (D3DKMTOpenAdapterFromDeviceName(ref request) < 0) return null;
            try { return ((ulong)(uint)request.Luid.High << 32) | request.Luid.Low; }
            finally { uint handle = request.Handle; D3DKMTCloseAdapter(ref handle); }
        }
        finally { Marshal.FreeHGlobal(name); }
    }
    private static string ActualDeviceId(string path)
    {
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) path = path[4..];
        int suffix = path.LastIndexOf("#{", StringComparison.Ordinal);
        if (suffix >= 0) path = path[..suffix];
        return path.Replace('#', '\\');
    }
    public void Dispose() => Reset();
    private static void Check(uint status) { if (status != 0) throw new IOException($"PDH: {status:X}"); }
    [StructLayout(LayoutKind.Explicit)] private struct CounterValue { [FieldOffset(0)] public uint Status; [FieldOffset(8)] public long Value; }
    [StructLayout(LayoutKind.Sequential)] private struct PageFile { public uint Size, Reserved; public nuint TotalSize, TotalInUse, PeakUsage; }
    [StructLayout(LayoutKind.Sequential)] private struct MemoryStatus { public uint Length, Load; public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, AvailableExtended; }
    [StructLayout(LayoutKind.Sequential)] private struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)] private struct OpenAdapter { public nint Name; public uint Handle; public Luid Luid; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private unsafe struct AdapterDescription
    { public fixed char Description[128]; public uint VendorId, DeviceId, SubSystemId, Revision; public nuint DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory; public Luid Luid; public uint Flags; }
    private delegate bool PageFileCallback(nint context, ref PageFile info, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [DllImport("psapi.dll", EntryPoint = "EnumPageFilesW", SetLastError = true)] private static extern bool EnumPageFiles(PageFileCallback callback, nint context);
    [DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, EntryPoint = "PdhOpenQueryW")] private static extern uint PdhOpenQuery(string? source, nuint data, out nint query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, EntryPoint = "PdhAddEnglishCounterW")] private static extern uint PdhAddEnglishCounter(nint query, string path, nuint data, out nint counter);
    [DllImport("pdh.dll")] private static extern uint PdhCollectQueryData(nint query);
    [DllImport("pdh.dll")] private static extern uint PdhGetFormattedCounterValue(nint counter, uint format, out uint type, out CounterValue value);
    [DllImport("pdh.dll")] private static extern uint PdhCloseQuery(nint query);
    [DllImport("dxgi.dll")] private static extern int CreateDXGIFactory1(ref Guid iid, out nint factory);
    [DllImport("gdi32.dll")] private static extern int D3DKMTOpenAdapterFromDeviceName(ref OpenAdapter adapter);
    [DllImport("gdi32.dll")] private static extern int D3DKMTCloseAdapter(ref uint handle);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, EntryPoint = "CM_Get_Device_Interface_List_SizeW")]
    private static extern uint CM_Get_Device_Interface_List_Size(out uint size, ref Guid cls, string? device, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, EntryPoint = "CM_Get_Device_Interface_ListW")]
    private static extern uint CM_Get_Device_Interface_List(ref Guid cls, string? device, [Out] char[] buffer, uint length, uint flags);
}

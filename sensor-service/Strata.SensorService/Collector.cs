using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.Hardware.Cpu;
using LibreHardwareMonitor.Hardware.Gpu;
using System.Reflection;

namespace Strata.SensorService;

public sealed record SensorValue(string Id, string Name, SensorType Type, double? Value);

public static class Selection
{
    public static SensorValue[] CoreClocks(IEnumerable<SensorValue> sensors) => sensors.Where(s =>
        s.Type == SensorType.Clock && (s.Name is "CPU Core" or "Core" ||
            s.Name.StartsWith("CPU Core #", StringComparison.Ordinal) || s.Name.StartsWith("Core #", StringComparison.Ordinal)) &&
        !s.Name.Contains('(') && Valid(s.Value) && s.Value > 0).ToArray();
    public static Reading FanPercentage(IEnumerable<SensorValue> sensors, long at)
    {
        var fans = sensors.Where(s => s.Type == SensorType.Control &&
            s.Name.Contains("Fan", StringComparison.OrdinalIgnoreCase) && Valid(s.Value, 100)).ToArray();
        return fans.Length > 0 ? Reading.Ready(fans.Max(s => s.Value!.Value), at, 100)
            : Reading.Missing("Fan percentage unavailable; RPM is not percentage");
    }
    public static T? MatchGpu<T>(IEnumerable<T> devices, Func<T, ulong?> identity, ulong luid,
        string? selectedPnpInstanceId = null, Func<T, string?>? pnpIdentity = null,
        uint? physicalAdapterCount = null) where T : class
    {
        if (physicalAdapterCount is not null and not 1) return null;
        // DXGI and device-name queries can expose distinct logical adapter
        // LUIDs for the same physical GPU in Session 0. Prefer the complete
        // physical PnP instance, never model/vendor/device or enumeration order.
        var pnp = NormalizePnpInstanceId(selectedPnpInstanceId);
        if (selectedPnpInstanceId is not null && (pnp is null || pnpIdentity is null)) return null;
        var matches = devices.Where(d => pnp is not null
            ? NormalizePnpInstanceId(pnpIdentity!(d)) == pnp
            : identity(d) == luid).Take(2).ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }
    public static string? NormalizePnpInstanceId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        string path = value.TrimEnd('\0').Trim().Replace('/', '\\');
        if (path.StartsWith(@"\REGISTRY\MACHINE\SYSTEM\", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith(@"HKEY_LOCAL_MACHINE\SYSTEM\", StringComparison.OrdinalIgnoreCase))
        {
            int marker = path.IndexOf(@"\Enum\", StringComparison.OrdinalIgnoreCase);
            if (marker < 0) return null;
            path = path[(marker + 6)..];
            const string parameters = @"\Device Parameters";
            if (path.EndsWith(parameters, StringComparison.OrdinalIgnoreCase)) path = path[..^parameters.Length];
        }
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal))
        {
            path = path[4..];
            int suffix = path.LastIndexOf("#{", StringComparison.Ordinal);
            if (suffix < 0 || !Guid.TryParse(path[(suffix + 1)..], out _)) return null;
            path = path[..suffix].Replace('#', '\\');
        }
        string[] parts = path.Split('\\');
        return parts.Length == 3 && parts.All(p => p.Length > 0 && p is not "." and not "..") &&
            !path.Any(char.IsControl) ? path.ToUpperInvariant() : null;
    }
    public static SensorValue? CpuTemperature(IEnumerable<SensorValue> sensors)
    {
        var candidates = sensors.Where(s => s.Type == SensorType.Temperature && Valid(s.Value, 200)).ToArray();
        foreach (string term in new[] { "Tdie", "Tctl", "Package", "Core" })
        {
            var matches = candidates.Where(s => s.Name.Contains(term, StringComparison.OrdinalIgnoreCase));
            if (term == "Tdie") matches = matches.Where(s => !s.Name.Contains("CCD", StringComparison.OrdinalIgnoreCase));
            var result = matches.OrderByDescending(s => s.Value).ThenBy(s => s.Id, StringComparer.Ordinal).FirstOrDefault();
            if (result is not null) return result;
        }
        return null;
    }
    public static bool Valid(double? value, double max = double.MaxValue) =>
        value is double v && double.IsFinite(v) && v >= 0 && v <= max;
    public static SensorValue? Named(IEnumerable<SensorValue> sensors, SensorType type, params string[] names) =>
        names.Select(n => sensors.FirstOrDefault(s => s.Type == type && s.Name == n && Valid(s.Value)))
            .FirstOrDefault(s => s is not null);
    public static Reading Metric(SensorValue? sensor, long at, double factor = 1, double max = double.MaxValue) =>
        sensor?.Value is double value ? Reading.Ready(value * factor, at, max) : Reading.Missing("Sensor not exposed by LHM");
}

/// <summary>Clears only LHM's managed observation cache, never IControl or hardware.
/// LHM 0.9.6 can silently retain Value on failed reads. Clearing before Update
/// ensures a value must actually be assigned again to receive a new timestamp.
/// The pinned implementation is checked at startup and fails closed if changed.</summary>
public static class ObservationCache
{
    private static readonly Type Sensor = typeof(Computer).Assembly.GetType("LibreHardwareMonitor.Hardware.Sensor", true)!;
    private static readonly PropertyInfo Value = Sensor.GetProperty("Value")!;
    public static void Clear(ISensor sensor)
    {
        if (sensor.GetType() != Sensor || Value.PropertyType != typeof(float?) || Value.SetMethod is null)
            throw new InvalidOperationException("Unsupported LHM sensor cache implementation");
        sensor.ValuesTimeWindow = TimeSpan.Zero;
        Value.SetValue(sensor, null);
    }
}

public sealed class Collector : IDisposable
{
    private readonly Func<long> tick;
    private readonly Func<string[], string> hardwareIdentity;
    public Collector() : this(() => Environment.TickCount64, WindowsMetrics.HardwareIdentity) { }
    internal Collector(Func<long> tick, Func<string[], string> hardwareIdentity)
    { this.tick = tick; this.hardwareIdentity = hardwareIdentity; }
    private Computer? computer;
    private readonly string instance = Guid.NewGuid().ToString("N");
    private ulong sequence;
    private long discovered;
    private string? discoveredIdentity;
    private bool needsRediscovery;
    internal long DiscoveryCount { get; private set; }
    private readonly WindowsMetrics windows = new();
    private readonly Dictionary<string, string> errors = new();
    private object? gpuIdentity;

    public void Reset()
    {
        computer?.Close();
        computer = null;
        discoveredIdentity = null;
        needsRediscovery = false;
        windows.Reset();
    }

    public Snapshot Collect(string[] channels)
    {
        var timer = System.Diagnostics.Stopwatch.StartNew();
        var timing = new Dictionary<string, long>();
        errors.Clear();
        gpuIdentity = null;
        string[] wanted = channels.Where(c => c is "cpu" or "gpu" or "memory").Order().ToArray();
        if (wanted.Length == 0 && computer is not null) Reset();
        string? identity = discoveredIdentity;
        bool changed = computer is null;
        bool discoveryDue = tick() - discovered > 30000;
        if (wanted.Length > 0 && (changed || discoveryDue))
        {
            // Rediscover device identity without tearing down working driver and
            // PDH sessions. Reopening LHM takes several seconds on real hardware
            // and used to expire every channel once per discovery interval.
            try { identity = hardwareIdentity(["cpu", "gpu", "memory"]); }
            catch (Exception e) { errors["discovery"] = e.Message; }
            discovered = tick();
        }
        if (wanted.Length > 0 && (changed || identity != discoveredIdentity || (needsRediscovery && discoveryDue)))
        {
            Reset();
            computer = new Computer
            {
                // Discover the supported inventory once per active session.
                // Changing client demand must not close live sensors. Only the
                // requested hardware groups are updated below.
                IsCpuEnabled = true, IsGpuEnabled = true,
                IsMemoryEnabled = true, IsMotherboardEnabled = false,
                IsControllerEnabled = false, IsNetworkEnabled = false, IsStorageEnabled = false
            };
            try { computer.Open(); discovered = tick(); discoveredIdentity = identity; DiscoveryCount++; }
            catch (Exception e) { errors["open"] = e.Message; Reset(); }
        }
        timing["discoveryMs"] = timer.ElapsedMilliseconds;
        long at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var updatedHardware = new List<string>();
        foreach (var hardware in computer?.Hardware ?? [])
        {
            bool requested = hardware is GenericCpu ? wanted.Contains("cpu")
                : hardware is GenericGpu ? wanted.Contains("gpu")
                : hardware.Identifier.ToString() == "/ram" && wanted.Contains("memory");
            if (!requested) continue;
            Update(hardware);
            updatedHardware.Add(hardware.Identifier.ToString());
        }
        timing["updateMs"] = timer.ElapsedMilliseconds - timing["discoveryMs"];
        var result = new Dictionary<string, ChannelSample>();
        foreach (string channel in channels)
        {
            long start = timer.ElapsedMilliseconds;
            try
            {
                result[channel] = channel switch
                {
                    "cpu" => Cpu(at), "gpu" => Gpu(at), "memory" => Memory(at),
                    "disk" => new("windows-volumes", new() { ["volumes"] = windows.Volumes() }),
                    _ => throw new InvalidDataException("Unknown channel")
                };
            }
            catch (Exception e) { errors[channel] = e.Message; }
            timing[channel + "Ms"] = timer.ElapsedMilliseconds - start;
        }
        return new(1, "snapshot", instance, ++sequence, at, result,
            new { processId = Environment.ProcessId, discoveryCount = DiscoveryCount, updatedHardware, timing, lhmVersion = "0.9.6", pawnIoVersion = LibreHardwareMonitor.PawnIo.PawnIo.Version?.ToString(),
                errors = new Dictionary<string, string>(errors), gpuIdentity, sources = new { primary = "libreHardwareMonitor", topology = "windows", cache = "windowsPdh",
                    paging = "windowsEnumPageFiles", volumes = "windows", gpuIdentity = "windowsDxgi" } });
    }

    private void Update(IHardware hardware)
    {
        try
        {
            foreach (var sensor in hardware.Sensors) ObservationCache.Clear(sensor);
            hardware.Update();
        }
        catch (Exception e) { errors[hardware.Identifier.ToString()] = e.Message; needsRediscovery = true; }
        foreach (var child in hardware.SubHardware) Update(child);
    }
    private SensorValue[] Sensors(IHardware hardware) =>
        errors.ContainsKey(hardware.Identifier.ToString()) ? [] : hardware.Sensors.Select(s =>
            new SensorValue(s.Identifier.ToString(), s.Name, s.SensorType, s.Value)).ToArray();
    private static SensorIdentity Identity(IHardware hw, SensorValue sensor) =>
        new("libreHardwareMonitor", hw.Identifier.ToString(), sensor.Id, sensor.Name);

    private ChannelSample Cpu(long at)
    {
        var cpus = (computer?.Hardware ?? []).OfType<GenericCpu>().OrderBy(c => c.Identifier.ToString()).ToArray();
        var loads = cpus.Select(cpu =>
        {
            var sensors = Sensors(cpu);
            var total = Selection.Named(sensors, SensorType.Load, "CPU Total");
            // Single-core LHM omits CPU Total; average its logical thread loads.
            double? value = total?.Value;
            if (value is null)
            {
                var threads = sensors.Where(s => s.Type == SensorType.Load && s.Name.StartsWith("CPU Core", StringComparison.Ordinal) &&
                    s.Name != "CPU Core Max" && Selection.Valid(s.Value, 100)).ToArray();
                if (threads.Length == cpu.CpuId.Sum(c => c.Length)) value = threads.Average(s => s.Value);
            }
            return (value, weight: cpu.CpuId.Sum(c => c.Length));
        }).ToArray();
        var clocks = cpus.Select(cpu => Selection.CoreClocks(Sensors(cpu))).ToArray();
        var temperatures = cpus.Select(cpu => (cpu, sensor: Selection.CpuTemperature(Sensors(cpu))))
            .Where(p => p.sensor is not null).OrderByDescending(p => p.sensor!.Value).ToArray();
        var hottest = temperatures.FirstOrDefault();
        var topology = windows.Topology(at);
        var data = new Dictionary<string, object?>
        {
            ["percent"] = loads.Length > 0 && loads.All(x => Selection.Valid(x.value, 100) && x.weight > 0)
                ? Reading.Ready(loads.Sum(x => x.value!.Value * x.weight) / loads.Sum(x => x.weight), at, 100)
                : Reading.Missing("CPU load unavailable"),
            ["frequencyHz"] = clocks.Length > 0 && clocks.All(x => x.Length > 0)
                ? Reading.Ready(clocks.SelectMany(x => x).Average(x => x.Value!.Value) * 1e6, at)
                : Reading.Missing("Core clocks unavailable"),
            ["physicalCores"] = topology.Physical, ["logicalProcessors"] = topology.Logical,
            ["maxFrequencyHz"] = topology.Nominal,
            ["temperatureCelsius"] = temperatures.Length == cpus.Length && cpus.Length > 0
                ? Selection.Metric(hottest.sensor, at, max: 200) : Reading.Missing("CPU package temperature unavailable"),
            ["temperatureSensor"] = hottest.sensor is null ? null : Identity(hottest.cpu, hottest.sensor)
        };
        return new(cpus.Length == 0 ? "cpu-unavailable" : string.Join(";", cpus.Select(c => c.Identifier.ToString())), data);
    }

    private ChannelSample Gpu(long at)
    {
        var adapter = WindowsMetrics.Adapter();
        var candidates = (computer?.Hardware ?? []).OfType<GenericGpu>().Select(g => new
        {
            Hardware = g,
            PnpInstanceId = g.DeviceId,
            Luid = WindowsMetrics.DeviceLuid(g.DeviceId)
        }).ToArray();
        GenericGpu? gpu = Selection.MatchGpu(candidates, g => g.Luid, adapter.Luid,
            adapter.PnpInstanceId, g => g.PnpInstanceId, adapter.PhysicalAdapterCount)?.Hardware;
        gpuIdentity = new
        {
            selectedLuid = adapter.Luid.ToString("X16"),
            selectedPnpInstanceId = adapter.PnpInstanceId,
            physicalPnpKey = adapter.PhysicalPnpKey,
            physicalAdapterCount = adapter.PhysicalAdapterCount,
            association = adapter.PnpInstanceId is not null ? "physicalPnpInstance" : "luid",
            candidates = candidates.Select(g => new { hardwareId = g.Hardware.Identifier.ToString(),
                g.Hardware.Name, g.PnpInstanceId, resolvedLuid = g.Luid?.ToString("X16") }).ToArray()
        };
        var sensors = gpu is null ? [] : Sensors(gpu);
        var temperature = Selection.Named(sensors, SensorType.Temperature, "GPU Core", "GPU");
        var power = Selection.Named(sensors, SensorType.Power, "GPU Package", "GPU Power", "GPU Total", "GPU Board Power");
        var used = Selection.Named(sensors, SensorType.SmallData, "GPU Memory Used", "GPU Dedicated Memory Used");
        var total = Selection.Named(sensors, SensorType.SmallData, "GPU Memory Total", "GPU Dedicated Memory Total");
        var shared = Selection.Named(sensors, SensorType.SmallData, "D3D Shared Memory Used", "GPU Shared Memory Used");
        var data = new Dictionary<string, object?>
        {
            ["adapter"] = new { adapter.Name, adapter.VendorId, adapter.DeviceId, dedicatedBytes = (double)adapter.DedicatedBytes },
            ["percent"] = Selection.Metric(Selection.Named(sensors, SensorType.Load, "GPU Core", "GPU D3D 3D"), at, max: 100),
            ["memoryUsedBytes"] = Selection.Metric(used, at, 1024 * 1024),
            ["memoryTotalBytes"] = total is null ? Reading.Ready(adapter.DedicatedBytes, at) : Selection.Metric(total, at, 1024 * 1024),
            ["sharedUsedBytes"] = Selection.Metric(shared, at, 1024 * 1024),
            ["sharedTotalBytes"] = windows.SharedLimit(at),
            ["temperatureCelsius"] = Selection.Metric(temperature, at, max: 200),
            ["powerWatts"] = Selection.Metric(power, at, max: 2000),
            ["fanPercent"] = Selection.FanPercentage(sensors, at),
            ["temperatureSensor"] = gpu is null || temperature is null ? null : Identity(gpu, temperature)
        };
        // An unsupported/ambiguous adapter is not an Update failure. Reopening
        // all working hardware every 30 seconds would recreate global outages.
        if (gpu is null) errors["gpuMatch"] = "GPU physical identity missing or ambiguous";
        return new(adapter.Luid.ToString("X16"), data);
    }

    private ChannelSample Memory(long at)
    {
        var memory = (computer?.Hardware ?? []).FirstOrDefault(h => h.Identifier.ToString() == "/ram");
        var sensors = memory is null ? [] : Sensors(memory);
        var used = Selection.Metric(Selection.Named(sensors, SensorType.Data, "Memory Used"), at, 1024d * 1024 * 1024);
        var available = Selection.Metric(Selection.Named(sensors, SensorType.Data, "Memory Available"), at, 1024d * 1024 * 1024);
        var total = used.Value is double u && available.Value is double a ? Reading.Ready(u + a, at) : Reading.Missing("Physical memory unavailable");
        var data = new Dictionary<string, object?>
        {
            ["totalBytes"] = total, ["availableBytes"] = available, ["usedBytes"] = used,
            ["percent"] = total.Value > 0 && used.Value is double value ? Reading.Ready(value / total.Value.Value * 100, at, 100) : Reading.Missing("Physical memory load unavailable"),
            ["cachedBytes"] = windows.Cached(at), ["pagingFileBytes"] = windows.Paging(at)
        };
        return new("physical-memory", data);
    }

    public void Dispose() { Reset(); windows.Dispose(); }
}

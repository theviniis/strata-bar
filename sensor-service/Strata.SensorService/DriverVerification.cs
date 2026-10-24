using System.Reflection;
using System.Runtime.Intrinsics.X86;
using System.Text;
using System.Text.Json.Serialization;
using LibreHardwareMonitor.PawnIo;

namespace Strata.SensorService;

internal sealed record CpuIdentity(string Manufacturer, int Family)
{
    internal static CpuIdentity Detect()
    {
        if (!X86Base.IsSupported) return new("unknown", 0);
        var (_, ebx, ecx, edx) = X86Base.CpuId(0, 0);
        string vendor = Encoding.ASCII.GetString(BitConverter.GetBytes(ebx)
            .Concat(BitConverter.GetBytes(edx)).Concat(BitConverter.GetBytes(ecx)).ToArray());
        int signature = X86Base.CpuId(1, 0).Eax;
        return new(vendor, DecodeFamily(signature));
    }

    internal static int DecodeFamily(int signature)
    {
        int family = (signature >> 8) & 15;
        return family == 15 ? family + ((signature >> 20) & 255) : family;
    }
}

internal sealed record ModuleCheck(string Name, bool Required, bool Loaded, string? FailureReason);
internal sealed record DriverVerificationResult(string? Version, bool ModuleLoaded,
    string Manufacturer, int Family, ModuleCheck[] Modules, string? FailureReason)
{
    [JsonIgnore] public bool Success => FailureReason is null;
}

internal static class DriverVerification
{
    // Mirrors CpuGroup in pinned LHM 0.9.6. RyzenSMU adds optional telemetry;
    // its absence must not veto the primary CPU module or ordinary CPU load.
    internal static (string Name, bool Required)[] SelectModules(CpuIdentity cpu) => cpu switch
    {
        { Manufacturer: "GenuineIntel" } => [("IntelMSR", true)],
        { Manufacturer: "AuthenticAMD", Family: 0x17 or 0x19 or 0x1A } =>
            [("AMDFamily17", true), ("RyzenSMU", false)],
        { Manufacturer: "AuthenticAMD", Family: 0x0F } => [("AMDFamily0F", true)],
        _ => []
    };

    internal static DriverVerificationResult Verify(CpuIdentity cpu, string? version, Func<string, bool> load)
    {
        var checks = SelectModules(cpu).Select(spec =>
        {
            try
            {
                bool loaded = load(spec.Name);
                return new ModuleCheck(spec.Name, spec.Required, loaded,
                    loaded ? null : "PawnIO could not open the driver or load the signed module.");
            }
            catch (Exception exception)
            {
                return new ModuleCheck(spec.Name, spec.Required, false, exception.GetBaseException().Message);
            }
        }).ToArray();
        var failed = checks.FirstOrDefault(check => check.Required && !check.Loaded);
        return new(version, checks.Any(check => check.Required) && failed is null,
            cpu.Manufacturer, cpu.Family, checks,
            checks.Length == 0 ? "CPU manufacturer/family is unsupported by this driver verification." :
            failed is null ? null : $"Required module {failed.Name}: {failed.FailureReason}");
    }

    internal static DriverVerificationResult Run() => Verify(CpuIdentity.Detect(), PawnIo.Version?.ToString(), Load);

    private static bool Load(string name)
    {
        var assembly = typeof(LibreHardwareMonitor.Hardware.Computer).Assembly;
        string resource = assembly.GetManifestResourceNames().Single(n =>
            n.EndsWith($"PawnIo.{name}.bin", StringComparison.Ordinal));
        var load = typeof(PawnIo).GetMethod("LoadModuleFromResource", BindingFlags.NonPublic | BindingFlags.Static)
            ?? throw new MissingMethodException("Pinned LHM module loader was not found.");
        var module = (PawnIo)load.Invoke(null, [assembly, resource])!;
        try { return module.IsLoaded; }
        finally { module.Close(); }
    }
}

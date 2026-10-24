using System.Text.Json;
using Xunit;

namespace Strata.SensorService.Tests;

public sealed class DriverVerificationTests
{
    [Theory]
    [InlineData("GenuineIntel", 6, "IntelMSR")]
    [InlineData("AuthenticAMD", 0x17, "AMDFamily17")]
    [InlineData("AuthenticAMD", 0x19, "AMDFamily17")]
    [InlineData("AuthenticAMD", 0x1A, "AMDFamily17")]
    [InlineData("AuthenticAMD", 0x0F, "AMDFamily0F")]
    public void SelectsOnlyMatchingVendorModules(string vendor, int family, string required)
    {
        var loaded = new List<string>();
        var result = DriverVerification.Verify(new(vendor, family), "2.2.0", name =>
        {
            loaded.Add(name);
            return true;
        });
        Assert.True(result.Success);
        Assert.True(result.ModuleLoaded);
        Assert.Equal(required, Assert.Single(result.Modules, m => m.Required).Name);
        Assert.Equal(result.Modules.Select(m => m.Name), loaded);
        if (vendor == "AuthenticAMD") Assert.DoesNotContain("IntelMSR", loaded);
    }

    [Theory]
    [InlineData(0x00800F00, 0x17)]
    [InlineData(0x00A00F00, 0x19)]
    [InlineData(0x00B00F00, 0x1A)]
    [InlineData(0x000906E0, 6)]
    public void DecodesExtendedFamily(int signature, int family) =>
        Assert.Equal(family, CpuIdentity.DecodeFamily(signature));

    [Fact]
    public void MissingOptionalSmuDoesNotFailInstallation()
    {
        var result = DriverVerification.Verify(new("AuthenticAMD", 0x19), "2.2.0", n => n != "RyzenSMU");
        Assert.True(result.Success);
        Assert.True(result.ModuleLoaded);
        Assert.NotNull(result.Modules.Single(m => m.Name == "RyzenSMU").FailureReason);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void RequiredModuleFailureProducesStructuredDiagnostic(bool throws)
    {
        var result = DriverVerification.Verify(new("AuthenticAMD", 0x19), "2.2.0",
            _ => throws ? throw new IOException("blocked driver") : false);
        Assert.False(result.Success);
        Assert.False(result.ModuleLoaded);
        Assert.Contains("AMDFamily17", result.FailureReason);
        var json = JsonSerializer.SerializeToElement(result, Protocol.Json);
        Assert.Equal("2.2.0", json.GetProperty("version").GetString());
        Assert.False(json.GetProperty("moduleLoaded").GetBoolean());
        Assert.Equal("AuthenticAMD", json.GetProperty("manufacturer").GetString());
        Assert.Equal(0x19, json.GetProperty("family").GetInt32());
        Assert.Equal(2, json.GetProperty("modules").GetArrayLength());
        Assert.NotNull(json.GetProperty("failureReason").GetString());
    }

    [Fact]
    public void UnsupportedCpuNeverAttemptsIntelModule()
    {
        var result = DriverVerification.Verify(new("AuthenticAMD", 0x10), null,
            _ => throw new InvalidOperationException("must not load"));
        Assert.Empty(result.Modules);
        Assert.False(result.Success);
        Assert.Contains("unsupported", result.FailureReason);
    }

    [Fact]
    public void PinnedLibraryContainsEverySelectedSignedResource()
    {
        var names = typeof(LibreHardwareMonitor.Hardware.Computer).Assembly.GetManifestResourceNames();
        foreach (var cpu in new[] { new CpuIdentity("GenuineIntel", 6), new("AuthenticAMD", 0x17), new("AuthenticAMD", 0x0F) })
            foreach (var module in DriverVerification.SelectModules(cpu))
                Assert.Single(names, n => n.EndsWith($"PawnIo.{module.Name}.bin", StringComparison.Ordinal));
    }
}

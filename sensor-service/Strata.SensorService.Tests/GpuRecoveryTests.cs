using Strata.SensorService;
using Xunit;

public sealed class GpuRecoveryTests
{
    private static Snapshot Sample(bool ready, string identity = "physical-gpu-1") =>
        new(1, "snapshot", "same-service", 1, 123,
            new() { ["gpu"] = new(identity, new()
            {
                ["percent"] = Reading.Ready(39, 123, 100),
                ["temperatureCelsius"] = ready ? Reading.Ready(52, 123, 200)
                    : Reading.Missing("Sensor not exposed by LHM")
            }) }, new { });

    [Fact]
    public void ContinuingGpuUpdatesWithoutPreviouslyWorkingTemperatureRequireRecovery()
    {
        var health = new GpuRecovery();
        Assert.False(health.ShouldRestart(Sample(true), 0));
        Assert.False(health.ShouldRestart(Sample(false), 2000));
        Assert.False(health.ShouldRestart(Sample(false), 31999));
        Assert.True(health.ShouldRestart(Sample(false), 32000));
    }

    [Fact]
    public void UnsupportedGpuNeverRestartsEvenAfterAServiceRestart()
    {
        var health = new GpuRecovery();
        Assert.False(health.ShouldRestart(Sample(false), 0));
        Assert.False(health.ShouldRestart(Sample(false), 30000));
        Assert.False(health.ShouldRestart(Sample(false), 86400000));
    }

    [Fact]
    public void TransientLossGetsANewGracePeriodAfterRecovery()
    {
        var health = new GpuRecovery();
        health.ShouldRestart(Sample(true), 0);
        health.ShouldRestart(Sample(false), 2000);
        Assert.False(health.ShouldRestart(Sample(true), 30000));
        Assert.False(health.ShouldRestart(Sample(false), 32000));
        Assert.False(health.ShouldRestart(Sample(false), 61999));
        Assert.True(health.ShouldRestart(Sample(false), 62000));
    }

    [Fact]
    public void ReplacementDoesNotInheritTheOldGpusTemperatureSupport()
    {
        var health = new GpuRecovery();
        health.ShouldRestart(Sample(true), 0);
        health.ShouldRestart(Sample(false), 2000);
        Assert.False(health.ShouldRestart(Sample(false, "other-gpu"), 32000));
        Assert.False(health.ShouldRestart(Sample(false, "other-gpu"), 86400000));
    }

    [Fact]
    public void ResumePreservesKnownSupportButDoesNotCountSuspendedTime()
    {
        var health = new GpuRecovery();
        health.ShouldRestart(Sample(true), 0);
        health.ShouldRestart(Sample(false), 2000);
        health.Pause();
        Assert.False(health.ShouldRestart(Sample(false), 86400000));
        Assert.True(health.ShouldRestart(Sample(false), 86430000));
    }

    [Fact]
    public void IdleTimeDoesNotCountAsFailedObservations()
    {
        var health = new GpuRecovery();
        health.ShouldRestart(Sample(true), 0);
        health.ShouldRestart(Sample(false), 2000);
        Assert.False(health.ShouldRestart(null, 20000));
        Assert.False(health.ShouldRestart(Sample(false), 100000));
        Assert.True(health.ShouldRestart(Sample(false), 130000));
    }
}

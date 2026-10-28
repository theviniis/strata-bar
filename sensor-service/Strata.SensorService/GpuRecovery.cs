namespace Strata.SensorService;

// Owns health across collector resets (including resume). A missing sensor on
// unsupported hardware must never turn into an endless service restart loop.
internal sealed class GpuRecovery
{
    private string? identity;
    private bool temperatureWasReady;
    private long? missingSince;

    public void Pause() => missingSince = null;

    public bool ShouldRestart(Snapshot? snapshot, long now)
    {
        if (snapshot is null || !snapshot.Channels.TryGetValue("gpu", out var gpu))
        {
            missingSince = null;
            return false;
        }
        if (gpu.Identity != identity)
        {
            identity = gpu.Identity;
            temperatureWasReady = false;
            missingSince = null;
        }
        if (gpu.Data.GetValueOrDefault("temperatureCelsius") is Reading { Status: "ready", Value: not null })
        {
            temperatureWasReady = true;
            missingSince = null;
            return false;
        }
        if (!temperatureWasReady) return false;
        missingSince ??= now;
        return now - missingSince.Value >= 30000;
    }
}

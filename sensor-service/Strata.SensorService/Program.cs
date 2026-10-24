using System.ServiceProcess;
using System.Text.Json;

namespace Strata.SensorService;

internal static class Program
{
    static async Task Main(string[] args)
    {
        if (args.SequenceEqual(new[] { "--verify-driver" }))
        {
            var result = DriverVerification.Run();
            Console.WriteLine(JsonSerializer.Serialize(result, Protocol.Json));
            Environment.ExitCode = result.Success ? 0 : 1;
        }
        else if (args.SequenceEqual(new[] { "--probe" }))
        {
            using var collector = new Collector();
            collector.Collect(["cpu", "gpu", "memory", "disk"]);
            await Task.Delay(2000);
            Console.WriteLine(JsonSerializer.Serialize(collector.Collect(Protocol.Channels), Protocol.Json));
        }
        else if (args.SequenceEqual(new[] { "--console" }))
        {
            using var stop = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
            await new SensorServer().Run(stop.Token);
        }
        else if (args.Length == 0) ServiceBase.Run(new SensorWindowsService());
        else throw new ArgumentException("Expected no arguments, --probe, --verify-driver or --console");
    }
}

internal sealed class SensorWindowsService : ServiceBase
{
    private readonly CancellationTokenSource stop = new();
    private Task? worker;
    public SensorWindowsService()
    {
        ServiceName = "Strata.SensorService";
        CanStop = true;
        CanShutdown = true;
        CanHandlePowerEvent = true;
    }
    private readonly SensorServer server = new();
    protected override void OnStart(string[] args)
    {
        worker = Task.Run(() => server.Run(stop.Token));
        _ = worker.ContinueWith(_ => Environment.Exit(1), TaskContinuationOptions.OnlyOnFaulted);
    }
    protected override bool OnPowerEvent(PowerBroadcastStatus status)
    {
        if (status is PowerBroadcastStatus.ResumeAutomatic or PowerBroadcastStatus.ResumeSuspend)
            server.Reset();
        return true;
    }
    protected override void OnStop() { stop.Cancel(); worker?.Wait(TimeSpan.FromSeconds(5)); }
    protected override void OnShutdown() => OnStop();
}

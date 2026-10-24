using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Strata.SensorService;

internal sealed class SensorServer(string pipeName = Protocol.PipeName)
{
    private readonly ConcurrentDictionary<Guid, string[]> clients = new();
    private readonly ConcurrentDictionary<Guid, Task> connections = new();
    private Snapshot? latest;
    private int reset;
    private long collections;
    private long collectingSince;
    internal long CollectionCount => Interlocked.Read(ref collections);
    public void Reset() => Interlocked.Exchange(ref reset, 1);

    public async Task Run(CancellationToken token)
    {
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
        token = lifetime.Token;
        Task accept = Accept(token);
        Task watchdog = Watchdog(token);
        using var collector = new Collector();
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        long last = Environment.TickCount64;
        try
        {
            do
            {
                if (accept.IsCompleted) await accept;
                Volatile.Write(ref collectingSince, Environment.TickCount64);
                // Tick gaps catch resume even in console mode. Periodic rediscovery
                // also handles device changes without opening unrelated hardware.
                if (Interlocked.Exchange(ref reset, 0) != 0 || Environment.TickCount64 - last > 6000)
                    collector.Reset();
                last = Environment.TickCount64;
                string[] channels = clients.Values.SelectMany(x => x).Distinct().ToArray();
                Volatile.Write(ref latest, channels.Length == 0 ? null : collector.Collect(channels));
                if (channels.Length > 0) Interlocked.Increment(ref collections);
                if (channels.Length == 0) collector.Reset();
                Volatile.Write(ref collectingSince, 0);
            } while (await timer.WaitForNextTickAsync(token));
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        finally
        {
            lifetime.Cancel();
            try { await accept; } catch (OperationCanceledException) { }
            try { await watchdog; } catch (OperationCanceledException) { }
            await Task.WhenAll(connections.Values);
        }
    }

    private async Task Watchdog(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await Task.Delay(1000, token);
            long start = Volatile.Read(ref collectingSince);
            // A driver call cannot be cancelled safely in-process. SCM restarts
            // this isolated service; the bar retains error-marked last readings.
            if (start != 0 && Environment.TickCount64 - start > 20000) Environment.Exit(1);
        }
    }

    private async Task Accept(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            if (connections.Count >= 15) { await Task.Delay(100, token); continue; }
            var pipe = CreatePipe(pipeName);
            try { await pipe.WaitForConnectionAsync(token); }
            catch { pipe.Dispose(); throw; }
            Guid id = Guid.NewGuid();
            Task connection = Serve(id, pipe, token);
            connections[id] = connection;
            _ = connection.ContinueWith(_ => connections.TryRemove(id, out var ignored), TaskScheduler.Default);
        }
    }

    private async Task Serve(Guid id, NamedPipeServerStream pipe, CancellationToken stop)
    {
        using (pipe)
        try
        {
            while (!stop.IsCancellationRequested)
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop);
                timeout.CancelAfter(TimeSpan.FromSeconds(6));
                Request request = await Protocol.Read<Request>(pipe, timeout.Token);
                request.Validate();
                clients[id] = request.Channels;
                Snapshot? snapshot = Volatile.Read(ref latest);
                // Requests double as leases; a crashed client cannot leave polling active.
                object response = snapshot is null
                    ? new { version = 1, type = "loading" }
                    : snapshot with { Channels = snapshot.Channels.Where(p => request.Channels.Contains(p.Key))
                        .ToDictionary(p => p.Key, p => p.Value) };
                await Protocol.Write(pipe, response, timeout.Token);
            }
        }
        catch (Exception e) when (e is IOException or OperationCanceledException or System.Text.Json.JsonException or UnauthorizedAccessException)
        { /* Per-client failures must not stop shared collection. */ }
        finally { clients.TryRemove(id, out _); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { public int Length; public nint Descriptor; public int Inherit; }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text, uint revision, out nint descriptor, out uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipe(string name, uint access, uint mode, uint instances,
        uint output, uint input, uint timeout, ref SecurityAttributes security);
    [DllImport("kernel32.dll")] private static extern nint LocalFree(nint value);

    private static NamedPipeServerStream CreatePipe(string name)
    {
        // Explicit rights exclude FILE_CREATE_PIPE_INSTANCE for ordinary clients.
        if (!ConvertStringSecurityDescriptorToSecurityDescriptor(
            "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;OW)(A;;0x12019B;;;AU)", 1, out nint descriptor, out _))
            throw new System.ComponentModel.Win32Exception();
        try
        {
            var security = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = descriptor };
            var handle = CreateNamedPipe(@"\\.\pipe\" + name,
                3 | 0x40000000, 8, 16, 65536, 65536, 0, ref security); // duplex, overlapped, reject remote
            if (handle.IsInvalid) { handle.Dispose(); throw new System.ComponentModel.Win32Exception(); }
            return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
        }
        finally { LocalFree(descriptor); }
    }
}

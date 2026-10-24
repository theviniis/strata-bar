using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using Strata.SensorService;
using Xunit;

public sealed class PipeTests
{
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle Open(string path, uint access, uint sharing, nint security, uint disposition, uint flags, nint template);
    private static async Task<NamedPipeClientStream> Connect(string name)
    {
        for (int i = 0; i < 100; i++)
        {
            var handle = Open(@"\\.\pipe\" + name, 0x12019b, 0, 0, 3, 0, 0);
            if (!handle.IsInvalid) return new NamedPipeClientStream(PipeDirection.InOut, false, true, handle);
            handle.Dispose();
            await Task.Delay(25);
        }
        throw new IOException("Test pipe did not become available");
    }
    private static async Task<JsonElement> Request(Stream stream, string[] channels, CancellationToken token)
    {
        await Protocol.Write(stream, new Request(1, "subscribe", channels), token);
        return await Protocol.Read<JsonElement>(stream, token);
    }
    [Fact]
    public async Task LiveLocalPipeSharesCollectionAndStopsWhenUnsubscribed()
    {
        string name = "Strata.SensorService.Test." + Guid.NewGuid().ToString("N");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var server = new SensorServer(name);
        Task running = server.Run(stop.Token);
        try
        {
            await Task.Delay(150);
            Assert.Equal(0, server.CollectionCount);
            using var first = await Connect(name);
            using var second = await Connect(name);
            await Request(first, ["memory"], stop.Token);
            await Request(second, ["memory"], stop.Token);
            JsonElement response = default;
            for (int i = 0; i < 8; i++)
            {
                await Task.Delay(500, stop.Token);
                response = await Request(first, ["memory"], stop.Token);
                if (response.GetProperty("type").GetString() == "snapshot") break;
            }
            Assert.Equal("snapshot", response.GetProperty("type").GetString());
            var memory = response.GetProperty("channels").GetProperty("memory").GetProperty("data");
            Assert.Equal("ready", memory.GetProperty("totalBytes").GetProperty("status").GetString());
            Assert.InRange(server.CollectionCount, 1, 2);
            await Request(first, [], stop.Token);
            await Request(second, [], stop.Token);
            await Task.Delay(2300, stop.Token);
            long count = server.CollectionCount;
            await Task.Delay(2300, stop.Token);
            Assert.Equal(count, server.CollectionCount);
        }
        finally { stop.Cancel(); await running; }
    }
    [Fact]
    public async Task MalformedClientDoesNotStopTheService()
    {
        string name = "Strata.SensorService.Test." + Guid.NewGuid().ToString("N");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var server = new SensorServer(name);
        Task running = server.Run(stop.Token);
        try
        {
            using (var bad = await Connect(name))
            {
                await Protocol.Write(bad, new Request(99, "setFan", []), stop.Token);
                await Assert.ThrowsAnyAsync<IOException>(() => Protocol.Read<JsonElement>(bad, stop.Token));
            }
            using var good = await Connect(name);
            var response = await Request(good, [], stop.Token);
            Assert.Equal("loading", response.GetProperty("type").GetString());
        }
        finally { stop.Cancel(); await running; }
    }
}

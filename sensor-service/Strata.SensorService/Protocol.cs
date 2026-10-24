using System.Buffers.Binary;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Strata.SensorService;

public static class Protocol
{
    public const int Version = 1;
    public const int Limit = 1024 * 1024;
    public const string PipeName = "Strata.SensorService.v1";
    public static readonly string[] Channels = ["cpu", "gpu", "memory", "disk"];
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    public static async Task<T> Read<T>(Stream stream, CancellationToken token)
    {
        byte[] header = new byte[4];
        await stream.ReadExactlyAsync(header, token);
        uint length = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length is 0 or > Limit) throw new InvalidDataException("Invalid frame length");
        byte[] bytes = new byte[length];
        await stream.ReadExactlyAsync(bytes, token);
        return JsonSerializer.Deserialize<T>(bytes, Json) ?? throw new InvalidDataException("Empty frame");
    }

    public static async Task Write(Stream stream, object value, CancellationToken token)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(value, Json);
        if (bytes.Length > Limit) throw new InvalidDataException("Frame too large");
        byte[] header = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)bytes.Length);
        await stream.WriteAsync(header, token);
        await stream.WriteAsync(bytes, token);
        await stream.FlushAsync(token);
    }
}

public sealed record Request(int Version, string Type, string[] Channels)
{
    public void Validate()
    {
        if (Version != Protocol.Version || Type != "subscribe" || Channels is null ||
            Channels.Length > 4 || Channels.Distinct().Count() != Channels.Length ||
            Channels.Any(c => !Protocol.Channels.Contains(c)))
            throw new InvalidDataException("Unsupported request");
    }
}

public sealed record SensorIdentity(string Provider, string HardwareId, string SensorId, string Name);
public sealed record Reading(string Status, double? Value, long? UpdatedAt, string? Error)
{
    public static Reading Ready(double value, long at, double max = double.MaxValue) =>
        double.IsFinite(value) && value >= 0 && value <= max
            ? new("ready", value, at, null) : Missing("Invalid sensor reading");
    public static Reading Missing(string reason) => new("unavailable", null, null, reason);
}

public sealed record ChannelSample(string Identity, Dictionary<string, object?> Data);
public sealed record Snapshot(int Version, string Type, string InstanceId, ulong Sequence,
    long SampledAt, Dictionary<string, ChannelSample> Channels, object Diagnostics);

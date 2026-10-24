using LibreHardwareMonitor.Hardware;
using Strata.SensorService;
using Xunit;
using SensorValue = Strata.SensorService.SensorValue;

public sealed class SensorsTests
{
    private static SensorValue Temperature(string name, double? value) => new(name, name, SensorType.Temperature, value);
    [Fact]
    public void CpuUsesDieBeforeControlAndPackageBeforeCore()
    {
        var values = new[] { Temperature("Core #1", 90), Temperature("CPU Package", 65), Temperature("Core (Tctl)", 70), Temperature("Core (Tdie)", 60), Temperature("CCD1 (Tdie)", 88) };
        Assert.Equal("Core (Tdie)", Selection.CpuTemperature(values)!.Name);
        Assert.Equal("CPU Package", Selection.CpuTemperature(values.Take(2))!.Name);
        Assert.Null(Selection.CpuTemperature([Temperature("CPU Package", double.NaN), Temperature("Core #1", null)]));
    }
    [Fact]
    public void MetricConversionPreservesZeroAndRejectsInvalidNumbers()
    {
        Assert.Equal(0, Selection.Metric(new("fan", "Fan", SensorType.Control, 0), 123, max: 100).Value);
        Assert.Equal(2 * 1024 * 1024, Selection.Metric(new("ram", "Used", SensorType.SmallData, 2), 123, 1024 * 1024).Value);
        foreach (double value in new[] { double.NaN, double.PositiveInfinity, -1, 101 })
            Assert.Equal("unavailable", Reading.Ready(value, 123, 100).Status);
        Assert.Null(Reading.Missing("offline").UpdatedAt);
    }
    [Fact]
    public void FanUsesMaximumReadbackPercentageAndNeverRpm()
    {
        var values = new[] { new SensorValue("rpm", "GPU Fan", SensorType.Fan, 1200),
            new SensorValue("one", "GPU Fan 1", SensorType.Control, 0), new SensorValue("two", "GPU Fan 2", SensorType.Control, 33) };
        Assert.Equal(33, Selection.FanPercentage(values, 123).Value);
        Assert.Equal("unavailable", Selection.FanPercentage(values.Take(1), 123).Status);
        Assert.Equal("unavailable", Selection.FanPercentage([new("invalid", "GPU Fan", SensorType.Control, 150)], 123).Status);
    }
    [Fact]
    public void CoreClocksExcludeBusAndEffectiveValuesAndSupportSingleCore()
    {
        var values = new[] { new SensorValue("bus", "Bus Speed", SensorType.Clock, 100),
            new SensorValue("core", "CPU Core", SensorType.Clock, 3000), new SensorValue("effective", "Core #1 (Effective)", SensorType.Clock, 1000),
            new SensorValue("core2", "Core #2", SensorType.Clock, 4000) };
        Assert.Equal(3500, Selection.CoreClocks(values).Average(s => s.Value));
    }
    private sealed record Gpu(string Model, ulong? Luid);
    [Fact]
    public void SameModelGpusAreMatchedOnlyByPhysicalIdentity()
    {
        var first = new Gpu("Same model", 1); var second = new Gpu("Same model", 2);
        Assert.Same(second, Selection.MatchGpu(new[] { first, second }, g => g.Luid, 2));
        Assert.Null(Selection.MatchGpu(new[] { first, first }, g => g.Luid, 1));
        Assert.Null(Selection.MatchGpu(new[] { new Gpu("Same model", null) }, g => g.Luid, 1));
    }
    [Fact]
    public async Task FramingHandlesPartialReadsAndRejectsOversizedFrames()
    {
        using var stream = new MemoryStream();
        await Protocol.Write(stream, new Request(1, "subscribe", ["cpu", "memory"]), default);
        stream.Position = 0;
        var request = await Protocol.Read<Request>(new FragmentedStream(stream), default);
        request.Validate();
        Assert.Equal(new[] { "cpu", "memory" }, request.Channels);
        foreach (uint length in new[] { 0u, 1024u * 1024 + 1, uint.MaxValue })
        {
            using var bad = new MemoryStream(BitConverter.GetBytes(length));
            await Assert.ThrowsAsync<InvalidDataException>(() => Protocol.Read<Request>(bad, default));
        }
    }
    [Fact]
    public void RejectsControlRequestsUnknownChannelsAndVersionMismatch()
    {
        foreach (var request in new[] { new Request(2, "subscribe", []), new Request(1, "setFan", []), new Request(1, "subscribe", ["cpu", "cpu"]), new Request(1, "subscribe", ["shell"]) })
            Assert.Throws<InvalidDataException>(request.Validate);
    }
    [Fact]
    public void ManagedCacheInvalidationDetectsSilentFailureAndAcceptsEqualNewValue()
    {
        var computer = new Computer { IsMemoryEnabled = true };
        computer.Open();
        var memory = computer.Hardware.First(h => h.Identifier.ToString() == "/ram");
        memory.Update();
        var sensor = memory.Sensors.First(s => s.SensorType == SensorType.Data);
        Assert.NotNull(sensor.Value);
        var setter = sensor.GetType().GetProperty("Value")!;
        setter.SetValue(sensor, (float?)42);
        ObservationCache.Clear(sensor);
        // Simulate an Update that returns without assigning anything.
        Assert.Null(sensor.Value);
        setter.SetValue(sensor, (float?)42);
        Assert.Equal(42, sensor.Value);
        ObservationCache.Clear(sensor);
        setter.SetValue(sensor, (float?)42);
        Assert.Equal(42, sensor.Value);
        computer.Close();
    }
    private sealed class FragmentedStream(Stream source) : Stream
    {
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) => source.ReadAsync(buffer[..Math.Min(1, buffer.Length)], token);
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) => source.Read(buffer, offset, Math.Min(1, count));
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}

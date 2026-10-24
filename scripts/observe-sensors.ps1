param(
  [ValidateRange(1,86400)][int]$Seconds = 90,
  [string]$OutputPath = (Join-Path $env:TEMP ('strata-sensors-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.jsonl'))
)
$ErrorActionPreference = 'Stop'
# Read-only service observer. The production Rust soak test additionally checks
# SCM authentication, canonical contracts and cache freshness.
$pipe = [IO.Pipes.NamedPipeClientStream]::new('.', 'Strata.SensorService.v1', [IO.Pipes.PipeDirection]::InOut)
$writer = [IO.StreamWriter]::new($OutputPath, $false)
$writer.AutoFlush = $true
function Read-FrameBytes([byte[]]$Bytes) {
  $offset = 0
  while ($offset -lt $Bytes.Length) {
    $read = $pipe.Read($Bytes, $offset, $Bytes.Length - $offset)
    if ($read -eq 0) { throw 'Sensor pipe disconnected' }
    $offset += $read
  }
}
try {
  $pipe.Connect(2000)
  $request = [Text.Encoding]::UTF8.GetBytes('{"version":1,"type":"subscribe","channels":["cpu","gpu","memory","disk"]}')
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $previous = 0
  while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
    $pipe.Write([BitConverter]::GetBytes([uint32]$request.Length),0,4)
    $pipe.Write($request,0,$request.Length)
    $header = [byte[]]::new(4)
    Read-FrameBytes $header
    $length = [BitConverter]::ToUInt32($header,0)
    if ($length -eq 0 -or $length -gt 1048576) { throw 'Invalid frame length' }
    $body = [byte[]]::new($length)
    Read-FrameBytes $body
    $snapshot = [Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
    $report = [ordered]@{ observedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); elapsedMs = $timer.ElapsedMilliseconds; snapshot = $snapshot }
    $writer.WriteLine(($report | ConvertTo-Json -Compress -Depth 30))
    if ($snapshot.sequence -ne $previous) {
      Write-Output ("sequence={0} ageMs={1} timings={2}" -f $snapshot.sequence, ($report.observedAt-$snapshot.sampledAt), ($snapshot.diagnostics.timing | ConvertTo-Json -Compress))
      $previous = $snapshot.sequence
    }
    Start-Sleep -Milliseconds 500
  }
} finally { $pipe.Dispose(); $writer.Dispose(); Write-Output "Evidence: $OutputPath" }

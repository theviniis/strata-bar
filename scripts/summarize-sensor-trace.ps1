param(
  [Parameter(Mandatory=$true)][string]$Path,
  [ValidateRange(0,60)][int]$WarmupSeconds = 10
)
$ErrorActionPreference = 'Stop'
$count = 0
$first = $null
$last = $null
$previous = $null
$maxGap = 0
$maxAge = 0
$failures = 0
$supported = @{}
$instances = @{}
$interruptions = [Collections.Generic.List[object]]::new()
$open = $null
$lastDiagnostics = $null
foreach ($line in [IO.File]::ReadLines([IO.Path]::GetFullPath($Path))) {
  # A concurrent writer can leave an incomplete final line; only analyze closed
  # traces for release evidence, never interpret malformed records as success.
  $row = $line | ConvertFrom-Json
  if ($null -eq $first) { $first = [long]$row.observedAt }
  $last = [long]$row.observedAt
  $count++
  $diagnostics = if ($null -ne $row.diagnostics) { $row.diagnostics } else { $row.sensors }
  $lastDiagnostics = $diagnostics
  if ($diagnostics.instanceId) { $instances[$diagnostics.instanceId] = $true }
  $samples = if ($null -ne $row.samples) { $row.samples } else { $null }
  $bad = [Collections.Generic.List[string]]::new()
  $steady = $last - $first -ge $WarmupSeconds * 1000
  if ($steady -and $null -ne $previous) {
    $gap = $last - $previous
    $maxGap = [math]::Max($maxGap,$gap)
    if ($gap -gt 6000) { $bad.Add('trace-gap') }
  }
  foreach ($channel in @('cpu','gpu','memory','disk')) {
    $data = if ($null -ne $samples) { $samples.$channel } else { $row.metrics.channels.$channel.data }
    if ($null -eq $data) {
      if ($steady) { $bad.Add($channel + ': missing snapshot') }
      continue
    }
    if ($steady) {
      $age = $last - [long]$data.sampledAt
      $maxAge = [math]::Max($maxAge,$age)
      if ($age -gt 6000) { $bad.Add($channel + ': expired snapshot') }
    }
    foreach ($metric in $data.PSObject.Properties) {
      if ($null -eq $metric.Value -or $null -eq $metric.Value.status) { continue }
      $key = $channel + '.' + $metric.Name
      if ($metric.Value.status -eq 'ready') { $supported[$key] = $true }
      elseif ($steady -and $supported.ContainsKey($key)) { $bad.Add($key + ': ' + $metric.Value.status) }
    }
  }
  if ($steady -and $bad.Count -gt 0) {
    $failures++
    if ($null -eq $open) {
      $open = [ordered]@{startedAt=$last;endedAt=$null;durationMs=$null;affected=@($bad);diagnostics=$diagnostics}
    }
  } elseif ($null -ne $open) {
    $open.endedAt = $last
    $open.durationMs = $last - $open.startedAt
    $interruptions.Add([pscustomobject]$open)
    $open = $null
  }
  $previous = $last
}
if ($null -ne $open) { $interruptions.Add([pscustomobject]$open) }
[ordered]@{
  path=[IO.Path]::GetFullPath($Path);sha256=(Get-FileHash -LiteralPath $Path).Hash
  observations=$count;firstObservedAt=$first;lastObservedAt=$last;durationMs=($last-$first)
  warmupSeconds=$WarmupSeconds;failingObservations=$failures;maxObservationGapMs=$maxGap
  maxSnapshotAgeMs=$maxAge;supportedMetrics=@($supported.Keys | Sort-Object)
  instances=@($instances.Keys);interruptions=@($interruptions);lastDiagnostics=$lastDiagnostics
} | ConvertTo-Json -Depth 20

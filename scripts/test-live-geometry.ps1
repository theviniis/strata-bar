param([string]$Executable='D:\REA\src-tauri\target\release\strata-bar.exe')
$ErrorActionPreference='Stop'
$probeProcess=Start-Process -FilePath $Executable -ArgumentList '--probe' -WindowStyle Hidden -Wait -PassThru
if($probeProcess.ExitCode -ne 0){throw 'Native geometry probe failed.'}
$report=Get-Content (Join-Path $env:TEMP 'strata-native-probe.json') -Raw | ConvertFrom-Json
$bars=@($report.bars | Where-Object visible)
if($bars.Count -ne $report.monitors.Count){throw "Expected one visible bar per monitor, found $($bars.Count) bars for $($report.monitors.Count) monitors."}
$checks=foreach($monitor in $report.monitors){
    $bounds=$monitor.monitor
    $matching=@($bars|Where-Object { $_.rect[0] -eq $bounds[0] -and $_.rect[2] -eq $bounds[2] })
    if($matching.Count -ne 1){throw "Expected one bar spanning monitor X=$($bounds[0])..$($bounds[2])."}
    $bar=$matching[0]
    if($bar.rect[1] -ne $bounds[1]){throw "Bar top $($bar.rect[1]) differs from monitor top $($bounds[1])."}
    if($bar.rect[3] -le $bar.rect[1] -or $bar.rect[3] -gt $bounds[3]){throw 'Bar height is outside monitor bounds.'}
    if($monitor.workArea[1] -lt $bar.rect[3]){throw 'The desktop work area does not reserve the full bar height.'}
    [pscustomobject]@{title=$bar.title;monitor=$bounds;actualWindow=$bar.rect;workArea=$monitor.workArea;passed=$true}
}
$checks|ConvertTo-Json -Depth 4|Set-Content docs/evidence/live-geometry-check.json
$checks|ConvertTo-Json -Depth 4

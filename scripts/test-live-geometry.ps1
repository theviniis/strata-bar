param(
    [string]$Executable=(Join-Path $PSScriptRoot '../src-tauri/target/release/strata-bar.exe'),
    [ValidateRange(28,80)][int]$Height=36,
    [ValidateSet('top','bottom')][string]$Position='top',
    [ValidateSet('true','false')][string]$Topmost='true',
    [string]$EvidenceDirectory=(Join-Path $PSScriptRoot '../docs/evidence')
)
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
    # AppBars negotiate around other shell reservations (for example the taskbar).
    if($bar.rect[1] -lt $bounds[1] -or $bar.rect[3] -gt $bounds[3]){throw 'Bar is outside monitor bounds.'}
    $expectedHeight=[math]::Round($Height * $bar.dpi / 96)
    if(($bar.rect[3] - $bar.rect[1]) -ne $expectedHeight){throw "Expected physical height $expectedHeight."}
    if($Position -eq 'top'){
        if($monitor.workArea[1] -lt $bar.rect[3]){throw 'The desktop work area does not reserve the top bar.'}
    }else{
        if($monitor.workArea[3] -gt $bar.rect[1]){throw 'The desktop work area does not reserve the bottom bar.'}
    }
    if($bar.komorebiEligible){throw 'The bar still carries WS_CAPTION/WS_EX_WINDOWEDGE, so komorebi can tile it.'}
    if(-not $bar.toolWindow){throw 'The bar is missing WS_EX_TOOLWINDOW.'}
    if($bar.topmost -ne ($Topmost -eq 'true')){throw 'The bar stacking differs from the configured topmost policy.'}
    [pscustomobject]@{title=$bar.title;monitor=$bounds;actualWindow=$bar.rect;workArea=$monitor.workArea;komorebiEligible=$bar.komorebiEligible;toolWindow=$bar.toolWindow;topmost=$bar.topmost;passed=$true}
}
$overlay=$report.overlay
if($null -eq $overlay){throw 'The probe does not report the overlay surface.'}
$overlayChecks=[pscustomobject]@{present=$false;komorebiEligible=$false;toolWindow=$false;topmost=$false;clickThrough=$false;visible=$false;passed=$true}
if($overlay.present){
    $surface=$overlay.window
    if($surface.komorebiEligible){throw 'The overlay carries WS_CAPTION/WS_EX_WINDOWEDGE, so komorebi can tile it.'}
    if(-not $surface.toolWindow){throw 'The overlay is missing WS_EX_TOOLWINDOW.'}
    if(-not $surface.topmost){throw 'The overlay is not topmost.'}
    if(-not $surface.clickThrough){throw 'The overlay is not click-through.'}
    $overlayChecks=[pscustomobject]@{present=$true;komorebiEligible=$surface.komorebiEligible;toolWindow=$surface.toolWindow;topmost=$surface.topmost;clickThrough=$surface.clickThrough;visible=$surface.visible;rect=$surface.rect;passed=$true}
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$checks|ConvertTo-Json -Depth 4|Set-Content (Join-Path $EvidenceDirectory "live-geometry-$stamp.json")
$overlayChecks|ConvertTo-Json -Depth 4|Set-Content (Join-Path $EvidenceDirectory "overlay-geometry-$stamp.json")
$checks|ConvertTo-Json -Depth 4
$overlayChecks|ConvertTo-Json -Depth 4

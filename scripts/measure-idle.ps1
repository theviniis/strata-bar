param([ValidateRange(1,3600)][int]$Seconds=30,[string]$OutputPath='')
$ErrorActionPreference='Stop'
if(-not $OutputPath){$OutputPath=Join-Path $PSScriptRoot ("../docs/performance/idle-lhm-"+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'.json')}
if(Test-Path -LiteralPath $OutputPath){throw 'Performance evidence already exists; choose a new output path.'}
$rootProcess=Get-Process -Name strata-bar | Select-Object -First 1
$rootId=$rootProcess.Id
$logicalProcessors=[Environment]::ProcessorCount
function Get-StrataProcessIds {
    $inventory=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
    $found=[System.Collections.Generic.HashSet[int]]::new()
    [void]$found.Add($rootId)
    $sensorService=Get-CimInstance Win32_Service -Filter "Name='Strata.SensorService'" -ErrorAction SilentlyContinue
    if($sensorService -and $sensorService.ProcessId -gt 0){[void]$found.Add([int]$sensorService.ProcessId)}
    do {$countBefore=$found.Count;foreach($entry in $inventory){if($found.Contains([int]$entry.ParentProcessId)){[void]$found.Add([int]$entry.ProcessId)}}}while($found.Count -ne $countBefore)
    return @($found)
}
$processIds=Get-StrataProcessIds
$previous=@{}
$samples=[System.Collections.Generic.List[object]]::new()
$clock=[Diagnostics.Stopwatch]::StartNew()
$previousTime=0.0
for($index=0;$index -le $Seconds;$index++) {
    if($index -gt 0){Start-Sleep -Seconds 1}
    if($index % 5 -eq 0){$processIds=Get-StrataProcessIds}
    $private=0L;$working=0L;$cpuDelta=0.0;$alive=0;$handles=0L
    foreach($processIdValue in $processIds){
        $item=Get-Process -Id $processIdValue -ErrorAction SilentlyContinue
        if($null -eq $item){continue}
        if($null -eq $item.CPU){throw 'Cannot read complete process CPU usage; run the measurement elevated.'}
        $alive++;$private+=$item.PrivateMemorySize64;$working+=$item.WorkingSet64;$handles+=$item.HandleCount
        if($previous.ContainsKey($processIdValue)){$cpuDelta+=[Math]::Max(0.0,[double]$item.CPU-[double]$previous[$processIdValue])}
        $previous[$processIdValue]=$item.CPU
    }
    $elapsed=$clock.Elapsed.TotalSeconds
    if($index -gt 0){$samples.Add([pscustomobject]@{elapsedSeconds=$elapsed;cpuSecondsDelta=$cpuDelta;cpuPercentMachine=100*$cpuDelta/(($elapsed-$previousTime)*$logicalProcessors);privateMiB=$private/1MB;workingSetMiB=$working/1MB;processCount=$alive;handleCount=$handles})}
    $previousTime=$elapsed
}
$report=[ordered]@{timestampUtc=[DateTime]::UtcNow.ToString('o');executable=$rootProcess.Path;rootProcessId=$rootId;logicalProcessors=$logicalProcessors;durationSeconds=$clock.Elapsed.TotalSeconds;notes='Full Strata descendant tree, including WebView2 and the separate installed sensor service when running. Working-set sum can double count shared pages. User desktop remained active; short exploratory sample, not a controlled YASB comparison.';summary=@{meanCpuPercentMachine=($samples|Measure-Object cpuPercentMachine -Average).Average;meanPrivateMiB=($samples|Measure-Object privateMiB -Average).Average;maxPrivateMiB=($samples|Measure-Object privateMiB -Maximum).Maximum;meanWorkingSetMiB=($samples|Measure-Object workingSetMiB -Average).Average};samples=$samples}
$outputDirectory=Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force $outputDirectory | Out-Null
$report|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $OutputPath
$report.summary|ConvertTo-Json

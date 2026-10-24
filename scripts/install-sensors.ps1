param(
  [Parameter(Mandatory)][ValidateSet('Prepare', 'Install', 'Remove', 'Rollback', 'ValidatePackage')][string]$Mode,
  [Parameter(Mandatory)][string]$InstallDir,
  [string]$PackageDirectory
)
$ErrorActionPreference = 'Stop'
# Tauri may inherit PowerShell 7's module path while launching Windows PS 5.1.
# Use this host's modules so cmdlet autoload never mixes runtime assemblies.
if ($PSVersionTable.PSEdition -eq 'Desktop') {
  $env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
}
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
function Get-PackageHash([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}

$serviceName = 'Strata.SensorService'
$systemRegistry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
$windowsKey = $systemRegistry.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion')
try { $programFiles = [string]$windowsKey.GetValue('ProgramFilesDir') }
finally { $windowsKey.Dispose(); $systemRegistry.Dispose() }
if (!$programFiles) { throw 'Cannot locate the protected Program Files directory.' }
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $programFiles 'Strata')).TrimEnd('\')
$installRoot = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if ($Mode -ne 'ValidatePackage' -and $installRoot -ine $expectedRoot) { throw "Sensor service must be installed in $expectedRoot" }
$serviceDir = Join-Path $installRoot 'sensor-service'
if ($Mode -eq 'ValidatePackage' -and $PackageDirectory) { $serviceDir = [IO.Path]::GetFullPath($PackageDirectory).TrimEnd('\') }
$backupDir = Join-Path $installRoot '.sensor-service-rollback'
$statePath = Join-Path $installRoot '.sensor-service-transaction.json'
$binary = Join-Path $serviceDir 'Strata.SensorService.exe'
foreach ($path in @($installRoot, $serviceDir, $backupDir)) {
  if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Service directories cannot be reparse points.' }
}
function Remove-SafeDirectory([string]$Path) {
  $absolute = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  if ($absolute -ine $serviceDir -and $absolute -ine $backupDir) { throw 'Unsafe removal target.' }
  if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}
function Invoke-ServiceControl([string[]]$Arguments) {
  & (Join-Path ([Environment]::SystemDirectory) 'sc.exe') @Arguments | Out-Null
  if ($LASTEXITCODE) { throw "Service control failed: $($Arguments -join ' ') ($LASTEXITCODE)" }
}
function Stop-Sensors {
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if ($service -and $service.Status -ne 'Stopped') {
    Stop-Service -Name $serviceName -ErrorAction Stop
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
  }
}
function Start-Sensors {
  Start-Service -Name $serviceName
  (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
  Start-Sleep -Milliseconds 1000
  if ((Get-Service -Name $serviceName).Status -ne 'Running') { throw 'Sensor service did not remain running.' }
}
function Validate-Package {
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $serviceDir 'manifest.json') | ConvertFrom-Json
  if ($manifest.version -ne 1 -or !$manifest.files.Count) { throw 'Invalid sensor manifest.' }
  foreach ($entry in $manifest.files) {
    $path = [IO.Path]::GetFullPath((Join-Path $serviceDir $entry.path))
    if (!$path.StartsWith($serviceDir + '\', [StringComparison]::OrdinalIgnoreCase) -or
        (Get-PackageHash $path) -ine $entry.sha256) { throw "Invalid package file: $($entry.path)" }
  }
  $pins = Get-Content -Raw -LiteralPath (Join-Path $serviceDir 'dependencies.json') | ConvertFrom-Json
  $pawn = Join-Path $serviceDir 'PawnIO_setup.exe'
  if ((Get-PackageHash $pawn) -ine $pins.pawnIo.sha256 -or
      (Get-AuthenticodeSignature -LiteralPath $pawn).Status -ne 'Valid') { throw 'PawnIO integrity verification failed.' }
}
function Restore-Sensors {
  if (!(Test-Path -LiteralPath $statePath)) { return }
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  Stop-Sensors
  if ($state.hadFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $backupDir 'service/Strata.SensorService.exe'))) { throw 'Rollback payload missing.' }
    Remove-SafeDirectory $serviceDir
    Copy-Item -LiteralPath (Join-Path $backupDir 'service') -Destination $serviceDir -Recurse
  } else {
    Remove-SafeDirectory $serviceDir
  }
  foreach ($name in @('strata-bar.exe', 'uninstall.exe')) {
    $saved = Join-Path $backupDir $name
    $current = Join-Path $installRoot $name
    if ((Test-Path -LiteralPath $saved) -and (!(Test-Path -LiteralPath $current) -or
        (Get-PackageHash $saved) -ne (Get-PackageHash $current))) {
      Copy-Item -LiteralPath $saved -Destination $current -Force
    }
  }
  if ($state.previousVersion) {
    $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
    $key = $registry.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\Strata', $true)
    try { if ($key) { $key.SetValue('DisplayVersion', [string]$state.previousVersion) } }
    finally { if ($key) { $key.Dispose() }; $registry.Dispose() }
  }
  if ($state.hadService) {
    if (!(Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
      Invoke-ServiceControl @('create', $serviceName, 'binPath=', ('"' + $binary + '"'), 'start=', 'auto', 'obj=', 'LocalSystem')
    }
    if ($state.wasRunning) { Start-Sensors }
  } elseif (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Invoke-ServiceControl @('delete', $serviceName)
  }
  Remove-SafeDirectory $backupDir
  Remove-Item -LiteralPath $statePath -Force
}

if ($Mode -eq 'ValidatePackage') { Validate-Package; exit 0 }
New-Item -ItemType Directory -Force $installRoot | Out-Null
$logPath = Join-Path $installRoot 'sensor-install.log'
if ((Test-Path -LiteralPath $logPath) -and ((Get-Item -LiteralPath $logPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation log cannot be a reparse point.' }
Start-Transcript -Path $logPath -Append | Out-Null
try {
  switch ($Mode) {
    'Prepare' {
      # Recover an interrupted prior transaction before starting another one.
      if (Test-Path -LiteralPath $statePath) { Restore-Sensors }
      $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
      $wasRunning = [bool]($service -and $service.Status -eq 'Running')
      $hadFiles = Test-Path -LiteralPath $binary
      Remove-SafeDirectory $backupDir
      New-Item -ItemType Directory -Force $backupDir | Out-Null
      if ($hadFiles) { Copy-Item -LiteralPath $serviceDir -Destination (Join-Path $backupDir 'service') -Recurse }
      foreach ($name in @('strata-bar.exe', 'uninstall.exe')) {
        $path = Join-Path $installRoot $name
        if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination $backupDir }
      }
      $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
      $key = $registry.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\Strata')
      $previousVersion = $null
      try { if ($key) { $previousVersion = $key.GetValue('DisplayVersion') } }
      finally { if ($key) { $key.Dispose() }; $registry.Dispose() }
      @{ hadService = [bool]$service; hadFiles = $hadFiles; wasRunning = $wasRunning; previousVersion = $previousVersion } |
        ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
      Stop-Sensors
    }
    'Install' {
      try {
        if (!(Test-Path -LiteralPath $statePath)) { throw 'Sensor transaction was not prepared.' }
        Validate-Package
        $pins = Get-Content -Raw -LiteralPath (Join-Path $serviceDir 'dependencies.json') | ConvertFrom-Json
        $installedVersion = $null
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
          $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
          $key = $registry.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO')
          try { if ($key) { $installedVersion = [version]$key.GetValue('DisplayVersion'); break } }
          finally { if ($key) { $key.Dispose() }; $registry.Dispose() }
        }
        if (!$installedVersion -or $installedVersion -lt [version]$pins.pawnIo.version) {
          $process = Start-Process -FilePath (Join-Path $serviceDir 'PawnIO_setup.exe') -ArgumentList '-install', '-silent' -PassThru -Wait -WindowStyle Hidden
          if ($process.ExitCode -notin @(0, 3010)) { throw "PawnIO install failed: $($process.ExitCode)" }
          if ($process.ExitCode -eq 3010) { throw 'PawnIO requires a reboot. Restart Windows and run Strata setup again.' }
        }
        & $binary --verify-driver
        if ($LASTEXITCODE) { throw 'PawnIO module could not be loaded; sensor installation was rolled back.' }
        if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
          Invoke-ServiceControl @('config', $serviceName, 'binPath=', ('"' + $binary + '"'), 'start=', 'auto', 'obj=', 'LocalSystem')
        } else {
          Invoke-ServiceControl @('create', $serviceName, 'binPath=', ('"' + $binary + '"'), 'start=', 'auto', 'obj=', 'LocalSystem', 'DisplayName=', 'Strata Hardware Sensors')
        }
        Invoke-ServiceControl @('failure', $serviceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/15000/restart/30000')
        Invoke-ServiceControl @('failureflag', $serviceName, '1')
        Start-Sensors
        Remove-SafeDirectory $backupDir
        Remove-Item -LiteralPath $statePath -Force
      } catch {
        $failure = $_
        Restore-Sensors
        throw $failure
      }
    }
    'Remove' {
      Stop-Sensors
      if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { Invoke-ServiceControl @('delete', $serviceName) }
      Remove-SafeDirectory $backupDir
      if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath -Force }
      # PawnIO belongs to the machine and may be used by other applications.
    }
    'Rollback' { Restore-Sensors }
  }
} finally { Stop-Transcript | Out-Null }

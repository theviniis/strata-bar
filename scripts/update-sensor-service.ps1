# Developer repair/update of the already installed service. Requires elevation;
# reuses the installer's validation, backup and rollback instead of bypassing it.
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run update-sensor-service.ps1 in an elevated PowerShell.'
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Join-Path $repository 'sensor-service/artifacts/publish'
$lifecycle = Join-Path $PSScriptRoot 'install-sensors.ps1'
$registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
$key = $registry.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion')
try { $installRoot = Join-Path ([string]$key.GetValue('ProgramFilesDir')) 'Strata' }
finally { $key.Dispose(); $registry.Dispose() }
$destination = [IO.Path]::GetFullPath((Join-Path $installRoot 'sensor-service'))
& $lifecycle -Mode ValidatePackage -InstallDir $installRoot -PackageDirectory $package
$service = Get-CimInstance Win32_Service -Filter "Name='Strata.SensorService'"
if (-not $service) { throw 'Install Strata before using the service-only updater.' }
try {
  & $lifecycle -Mode Prepare -InstallDir $installRoot
  if ($service.ProcessId -gt 0) {
    $previous = Get-Process -Id $service.ProcessId -ErrorAction SilentlyContinue
    if ($previous -and -not $previous.WaitForExit(10000)) { throw 'Previous sensor service has not exited.' }
  }
  foreach ($file in Get-ChildItem -LiteralPath $package -File -Recurse) {
    $relative = $file.FullName.Substring($package.Length + 1)
    $output = [IO.Path]::GetFullPath((Join-Path $destination $relative))
    if (-not $output.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe sensor update target.' }
    New-Item -ItemType Directory -Force (Split-Path $output) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $output -Force
  }
  & $lifecycle -Mode Install -InstallDir $installRoot
} catch {
  & $lifecycle -Mode Rollback -InstallDir $installRoot
  throw
}

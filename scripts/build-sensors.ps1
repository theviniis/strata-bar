param([string]$Dotnet = 'dotnet')
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

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sensorRoot = Join-Path $repoRoot 'sensor-service'
$stage = Join-Path $sensorRoot 'artifacts/publish'
$cache = Join-Path $sensorRoot 'artifacts/downloads'
$pins = Get-Content -Raw (Join-Path $sensorRoot 'dependencies.json') | ConvertFrom-Json
New-Item -ItemType Directory -Force $stage, $cache | Out-Null
& $Dotnet restore (Join-Path $sensorRoot 'Strata.SensorService') --locked-mode
if ($LASTEXITCODE) { throw 'Sensor restore failed; .NET 10 SDK is required.' }
& $Dotnet publish (Join-Path $sensorRoot 'Strata.SensorService') -c Release -r win-x64 --self-contained true --no-restore -o $stage
if ($LASTEXITCODE) { throw 'Sensor publish failed.' }

$pawn = Join-Path $stage 'PawnIO_setup.exe'
if (!(Test-Path -LiteralPath $pawn)) { Invoke-WebRequest -UseBasicParsing $pins.pawnIo.url -OutFile $pawn }
if ((Get-PackageHash $pawn) -ine $pins.pawnIo.sha256) { throw 'PawnIO hash mismatch.' }
$signature = Get-AuthenticodeSignature -LiteralPath $pawn
if ($signature.Status -ne 'Valid') { throw "PawnIO signature is not valid: $($signature.Status)" }
Copy-Item -LiteralPath (Join-Path $sensorRoot 'dependencies.json') -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-sensors.ps1') -Destination $stage

# Ship exact upstream source, including pinned Git submodules. These archives
# make the distributed driver/modules and MPL library sources available offline.
$sources = Join-Path $stage 'sources'
New-Item -ItemType Directory -Force $sources | Out-Null
function Add-Source([string]$Repository, [string]$Revision, [int]$Depth = 0) {
  if ($Depth -gt 5 -or $Repository -notmatch '^[\w.-]+/[\w.-]+$' -or $Revision -notmatch '^[\w.-]+$') { throw 'Invalid source coordinates.' }
  $archive = Join-Path $sources (($Repository -replace '/', '-') + "-$Revision.zip")
  if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Repository/zip/$Revision" -OutFile $archive
  }
  # Resolve submodules from GitHub's immutable tree and .gitmodules, not HEAD.
  $metadata = Join-Path $cache (($Repository -replace '/', '-') + "-$Revision-tree.json")
  if (!(Test-Path -LiteralPath $metadata)) {
    Invoke-RestMethod "https://api.github.com/repos/$Repository/git/trees/$Revision`?recursive=1" |
      ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $metadata -Encoding UTF8
  }
  $tree = Get-Content -Raw -LiteralPath $metadata | ConvertFrom-Json
  $links = @($tree.tree | Where-Object { $_.type -eq 'commit' })
  if ($links.Count) {
    $moduleFile = Join-Path $cache (($Repository -replace '/', '-') + "-$Revision-gitmodules.txt")
    if (!(Test-Path -LiteralPath $moduleFile)) {
      Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/$Repository/$Revision/.gitmodules" -OutFile $moduleFile
    }
    $modules = Get-Content -Raw -LiteralPath $moduleFile
    foreach ($link in $links) {
      $section = [regex]::Matches($modules, '(?ms)^\[submodule[^\]]+\](.*?)(?=^\[|\z)') |
        Where-Object { $_.Groups[1].Value -match ('(?m)^\s*path\s*=\s*' + [regex]::Escape($link.path) + '\s*$') }
      if (!$section -or $section.Count -ne 1 -or $section[0].Value -notmatch 'url\s*=\s*https://github.com/([\w.-]+/[\w.-]+)') { throw "Unresolved submodule $($link.path)" }
      Add-Source ($Matches[1] -replace '\.git$', '') $link.sha ($Depth + 1)
    }
  }
}
Add-Source $pins.lhm.repository $pins.lhm.commit
Add-Source $pins.pawnIo.repository $pins.pawnIo.commit
Add-Source $pins.pawnModules.repository $pins.pawnModules.commit

# Tauri's default reinstall flow uninstalls the old resources before PREINSTALL.
# Generate a pinned template which uses in-place updates, so the service backup
# exists before any replacement. Keep the upstream copyright/license header.
$upstream = Join-Path $cache 'installer-upstream.nsi'
if (!(Test-Path -LiteralPath $upstream)) {
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/tauri-apps/tauri/$($pins.nsisTemplate.commit)/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi" -OutFile $upstream
}
if ((Get-PackageHash $upstream) -ine $pins.nsisTemplate.sha256) { throw 'NSIS template hash mismatch.' }
$template = Get-Content -Raw -LiteralPath $upstream
$mutex = @'
  ; Hold this process-wide handle until exit; serialize install/uninstall across sessions.
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Global\StrataSensorInstaller") p.r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    MessageBox MB_ICONSTOP "Another Strata installation or uninstallation is running."
    Abort
  ${EndIf}

'@
$template = $template.Replace('Function .onInit', "Function .onInit`n" + $mutex)
$template = $template.Replace('Function un.onInit', "Function un.onInit`n" + $mutex)
$anchor = '  ; Abort downgrades if they are disabled, in the modes that skip the reinstall page choice:'
if (($template.Split(@($anchor), [StringSplitOptions]::None)).Length -ne 2) { throw 'NSIS template anchor changed.' }
$upgrade = @'
  ; Preserve the old service until the transactional hooks have backed it up.
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $UpdateMode 1
  ${EndIf}

'@
$callbacks = @'

Function .onInstFailed
  IfFileExists "$INSTDIR\.sensor-service-transaction.json" 0 strata_failed_done
  !insertmacro StrataSensorScript
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-sensors.ps1" -Mode Rollback -InstallDir "$INSTDIR"' $0
  strata_failed_done:
FunctionEnd

Function StrataAbortRecovery
  IfFileExists "$INSTDIR\.sensor-service-transaction.json" 0 strata_abort_done
  !insertmacro StrataSensorScript
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-sensors.ps1" -Mode Rollback -InstallDir "$INSTDIR"' $0
  strata_abort_done:
FunctionEnd
'@
[IO.File]::WriteAllText((Join-Path $sensorRoot 'artifacts/installer.nsi'),
  ($template.Replace($anchor, $upgrade + $anchor) + $callbacks), [Text.UTF8Encoding]::new($false))

$licenses = Join-Path $stage 'licenses'
New-Item -ItemType Directory -Force $licenses | Out-Null
Copy-Item -LiteralPath (Join-Path $sensorRoot 'THIRD-PARTY-NOTICES.md') -Destination $licenses
$assets = Get-Content -Raw (Join-Path $sensorRoot 'Strata.SensorService/obj/project.assets.json') | ConvertFrom-Json
$packageFolder = @($assets.packageFolders.PSObject.Properties.Name)[0]
foreach ($library in $assets.libraries.PSObject.Properties) {
  if ($library.Value.type -ne 'package') { continue }
  $package = Join-Path $packageFolder $library.Value.path
  $destination = Join-Path $licenses ($library.Name -replace '/', '-')
  New-Item -ItemType Directory -Force $destination | Out-Null
  Get-ChildItem -LiteralPath $package -Recurse -File | Where-Object {
    $_.Name -match '(?i)^(license|licence|copying|notice|third.party)' -or $_.Extension -eq '.nuspec'
  } | ForEach-Object {
    $relative = $_.FullName.Substring($package.Length).TrimStart('\', '/')
    $output = Join-Path $destination $relative
    New-Item -ItemType Directory -Force (Split-Path $output) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $output
  }
}
$manifest = @(Get-ChildItem -LiteralPath $stage -File -Recurse | Where-Object { $_.Name -ne 'manifest.json' } | ForEach-Object {
  @{ path = $_.FullName.Substring($stage.Length + 1).Replace('\', '/'); sha256 = (Get-PackageHash $_.FullName).ToLowerInvariant() }
})
@{ version = 1; files = $manifest } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding UTF8
Write-Host "Sensor package ready: $stage"

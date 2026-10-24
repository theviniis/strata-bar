param(
  [string]$Dotnet = $env:STRATA_DOTNET,
  [string[]]$Candidates,
  [string]$CacheRoot = (Join-Path $PSScriptRoot '../sensor-service/artifacts/build-tools')
)
$ErrorActionPreference = 'Stop'

function Find-SdkHost([string]$Candidate) {
  $command = Get-Command $Candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (!$command) { return $null }
  $sdks = & $command.Source --list-sdks 2>$null
  if ($LASTEXITCODE -eq 0 -and @($sdks | Where-Object { $_ -match '^10\.\d+\.\d+\s' }).Count -gt 0) {
    return $command.Source
  }
  return $null
}

if (![string]::IsNullOrWhiteSpace($Dotnet)) {
  $resolved = Find-SdkHost $Dotnet
  if (!$resolved) { throw "The explicit SDK host '$Dotnet' does not provide a .NET 10 SDK. Fix STRATA_DOTNET / -Dotnet, or clear it to enable automatic setup." }
  return $resolved
}

$pin = Get-Content -Raw (Join-Path $PSScriptRoot 'dotnet-sdk.json') | ConvertFrom-Json
$CacheRoot = [IO.Path]::GetFullPath($CacheRoot)
$sdkRoot = Join-Path $CacheRoot "dotnet-$($pin.version)-win-x64"
$cachedHost = Join-Path $sdkRoot 'dotnet.exe'
if (!$PSBoundParameters.ContainsKey('Candidates')) {
  $Candidates = @('dotnet', (Join-Path $env:LOCALAPPDATA 'Strata/dotnet-sdk/dotnet.exe')) +
    @($env:DOTNET_ROOT, $env:DOTNET_ROOT_X64 | Where-Object { $_ } | ForEach-Object { Join-Path $_ 'dotnet.exe' })
}
foreach ($candidate in (@($Candidates) + @($cachedHost))) {
  $resolved = Find-SdkHost $candidate
  if ($resolved) { return $resolved }
}

# Bootstrap only build tools. Nothing is installed system-wide or added to PATH,
# and the SDK is outside artifacts/publish so it never enters the installer.
New-Item -ItemType Directory -Force $CacheRoot | Out-Null
$lock = [IO.File]::Open((Join-Path $CacheRoot 'dotnet-bootstrap.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
  $resolved = Find-SdkHost $cachedHost
  if ($resolved) { return $resolved }
  if (Test-Path -LiteralPath $sdkRoot) { throw "Invalid SDK cache at '$sdkRoot'. Use a working STRATA_DOTNET host or repair this cache." }
  $archive = Join-Path $CacheRoot "dotnet-sdk-$($pin.version)-win-x64.zip"
  if (!(Test-Path -LiteralPath $archive)) {
    $partial = "$archive.$([guid]::NewGuid().ToString('N')).partial"
    Write-Host "Downloading .NET SDK $($pin.version) from Microsoft (first build only)..."
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $partial
    $download = $partial
  } else { $download = $archive }
  $stream = [IO.File]::OpenRead($download)
  $algorithm = [Security.Cryptography.SHA512]::Create()
  try { $hash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
  if ($hash -cne $pin.sha512) { throw 'Downloaded .NET SDK SHA-512 mismatch; refusing to extract or run it.' }
  if ($download -ne $archive) { [IO.File]::Move($download, $archive) }
  Write-Host "Extracting verified .NET SDK $($pin.version)..."
  $extract = Join-Path $CacheRoot ("dotnet-extract-" + [guid]::NewGuid().ToString('N'))
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extract)
  $resolved = Find-SdkHost (Join-Path $extract 'dotnet.exe')
  if (!$resolved) { throw 'Downloaded SDK did not expose a .NET 10 SDK.' }
  [IO.Directory]::Move($extract, $sdkRoot)
  return $cachedHost
} finally { $lock.Dispose() }

$ErrorActionPreference = 'Stop'
$resolver = Join-Path $PSScriptRoot 'resolve-dotnet.ps1'
$root = Join-Path ([IO.Path]::GetTempPath()) ('strata-dotnet-resolution-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$runtime = Join-Path $root 'runtime.cmd'
$sdk = Join-Path $root 'sdk.cmd'
Set-Content -LiteralPath $runtime -Value @('@echo off', 'exit /b 0') -Encoding ascii
Set-Content -LiteralPath $sdk -Value @('@echo off', 'echo 10.0.402 [test-sdk]', 'exit /b 0') -Encoding ascii

$selected = & $resolver -Dotnet '' -Candidates @($runtime, $sdk) -CacheRoot (Join-Path $root 'unused')
if ($selected -ne $sdk) { throw 'Runtime-only host prevented selecting an available SDK.' }
$selected = & $resolver -Dotnet $sdk -CacheRoot (Join-Path $root 'unused')
if ($selected -ne $sdk) { throw 'Explicit SDK was not respected.' }
$rejected = $false
try { & $resolver -Dotnet $runtime -CacheRoot (Join-Path $root 'unused') | Out-Null }
catch { if ($_.Exception.Message -notlike '*explicit SDK host*') { throw }; $rejected = $true }
if (!$rejected) { throw 'Runtime-only explicit override was accepted.' }

# Reproduce no installed SDK, without relying on this machine's developer tools.
# A corrupt cached download must be rejected before extraction or execution.
$cache = Join-Path $root 'corrupt-cache'
New-Item -ItemType Directory -Path $cache | Out-Null
$pin = Get-Content -Raw (Join-Path $PSScriptRoot 'dotnet-sdk.json') | ConvertFrom-Json
Set-Content -LiteralPath (Join-Path $cache "dotnet-sdk-$($pin.version)-win-x64.zip") -Value 'corrupt archive'
$rejected = $false
try { & $resolver -Dotnet '' -Candidates @($runtime) -CacheRoot $cache | Out-Null }
catch { if ($_.Exception.Message -notlike '*SHA-512 mismatch*') { throw }; $rejected = $true }
if (!$rejected) { throw 'Corrupt SDK archive was accepted.' }
Write-Host '4 SDK resolution checks passed.'

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-sensors.ps1')
if (!$?) { exit 1 }
& pnpm build
exit $LASTEXITCODE

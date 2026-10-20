# Windows locks a running debug executable; catch that before Cargo links it.
$ErrorActionPreference = 'Stop'
$debugExecutable = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/target/debug/strata-bar.exe'))
$activeDebug = @(Get-Process -Name strata-bar -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and [string]::Equals($_.Path, $debugExecutable, [StringComparison]::OrdinalIgnoreCase)
})
if ($activeDebug.Count -gt 0) {
    [Console]::Error.WriteLine("Strata debug ja esta em execucao (PID $($activeDebug.Id -join ', ')). Use Sair no icone do Strata na bandeja e execute pnpm desktop novamente. O Windows bloqueia a substituicao do executavel enquanto ele esta aberto.")
    exit 1
}

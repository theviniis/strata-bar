# Sensor package notices

Strata.SensorService uses LibreHardwareMonitorLib 0.9.6 (MPL-2.0), unmodified.
The exact source archive, its third-party notices, licenses and PawnIO module
resources are distributed in `sources/`. The narrow observation-cache adapter
belongs to Strata; it does not modify the distributed LHM assembly.

PawnIO 2.2.0 is distributed as the original digitally signed official installer.
Its source is GPL-2.0-or-later with the upstream interface exception. Its source,
license, build files and pinned submodule sources are included in `sources/`.
PawnIO.Modules 0.1.6 source is included for the modules embedded by LHM.
The upstream licenses and exceptions in those archives govern each component.

The .NET runtime and managed dependencies are included for offline execution.
`licenses/` includes package license files and NuGet metadata identifying each
version and license. `manifest.json` records SHA-256 hashes of package contents.
Driver APIs supplied by Windows and installed graphics drivers remain required.

No Libre Hardware Monitor GUI or MSI Afterburner is distributed or required.

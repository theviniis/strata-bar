; Service lifecycle hooks run elevated in the per-machine installer. Payload
; verification, rollback and path validation live in the embedded PS script.
!define STRATA_SENSOR_INSTALL_SCRIPT "${__FILEDIR__}\..\..\scripts\install-sensors.ps1"
!define MUI_CUSTOMFUNCTION_ABORT StrataAbortRecovery
!macro StrataSensorScript
  InitPluginsDir
  File /oname=$PLUGINSDIR\install-sensors.ps1 "${STRATA_SENSOR_INSTALL_SCRIPT}"
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro StrataSensorScript
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-sensors.ps1" -Mode Prepare -InstallDir "$INSTDIR"' $0
  ${If} $0 <> 0
    MessageBox MB_ICONSTOP "Could not prepare the Strata sensor service. Existing service files were preserved."
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-sensors.ps1" -Mode Install -InstallDir "$INSTDIR"' $0
  ${If} $0 <> 0
    MessageBox MB_ICONSTOP "Sensor installation failed. Recovery of the previous service was attempted. See sensor-install.log in the Strata installation folder."
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro StrataSensorScript
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-sensors.ps1" -Mode Remove -InstallDir "$INSTDIR"' $0
  ${If} $0 <> 0
    MessageBox MB_ICONSTOP "Could not stop the Strata sensor service. Uninstallation was stopped."
    Abort
  ${EndIf}
!macroend

## Contexto

Feature pessoal para monitorar o status do dispositivo MIDI "WORLDE easy control" no Voicemeeter. Quando desconecta, fica vermelho em "M.I.D.I Mapping > M.I.D.I Input Device" e exige reiniciar o Audio Engine.

## Abordagem

Criar módulo Rust `src-tauri/src/midi_monitor.rs` que:

1. Usa `winmm.dll` (Windows MIDI API) para detectar se "WORLDE easy control" está conectado:
   - `midiInGetNumDevs()` - conta dispositivos MIDI de entrada
   - `midiInGetDevCapsW()` - obtém nome de cada dispositivo
2. Reinicia Audio Engine do Voicemeeter via `Command.Restart = 1.0` na `VoicemeeterRemote64.dll`

## Tarefas

- [ ] Criar `src-tauri/src/midi_monitor.rs`
- [ ] Implementar `check_device(device_name: &str) -> Result<MidiDeviceStatus, String>`
- [ ] Implementar `restart_voicemeeter_audio_engine() -> Result<(), String>`
- [ ] Adicionar testes unitários (mock winmm/Voicemeeter)
- [ ] Registrar módulo em `src-tauri/src/main.rs` ou `lib.rs`
- [ ] Adicionar dependência `windows` crate features necessárias

## Critérios de Aceite

- `check_device("WORLDE easy control")` retorna `Connected` quando dispositivo presente
- `check_device("WORLDE easy control")` retorna `Disconnected` quando dispositivo ausente
- `restart_voicemeeter_audio_engine()` executa `VBVMR_SetParameterFloat("Command.Restart", 1.0)`
- Testes passam com mocks

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`

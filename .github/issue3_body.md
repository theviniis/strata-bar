## Contexto

Expor o canal MIDI e comando de reinicialização para o frontend via bridge TypeScript e comandos Tauri.

## Tarefas

### bridge.ts (`src/services/system/bridge.ts`)

- [ ] Adicionar `'voicemeeterMidi'` ao tipo `Channel`
- [ ] Adicionar tipo `MidiDeviceStatus` exportado
- [ ] Adicionar `voicemeeterMidi: MidiDeviceStatus` a `ChannelData`
- [ ] Adicionar método `restartVoicemeeterAudioEngine(): Promise<void>` em `AdapterBase` / `NativeBridge`

### Tauri Commands (`src-tauri/src/main.rs`)

- [ ] Adicionar comando `restart_voicemeeter_audio_engine` que chama `MidiMonitor::restart_voicemeeter_audio_engine()`
- [ ] Registrar no `invoke_handler`

## Critérios de Aceite

- Frontend pode subscrever `voicemeeterMidi` via `bridge.subscribe()`
- Frontend pode chamar `bridge.restartVoicemeeterAudioEngine()`
- Tipos TypeScript compilam sem erros
- Comando Tauri executa e retorna resultado

## Dependências

- Issue #32: midi_monitor.rs implementado

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`

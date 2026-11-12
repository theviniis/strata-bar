## Contexto

Integrar o monitor MIDI no worker de métricas existente (`src-tauri/src/metrics.rs`) para publicar o status periodicamente.

## Tarefas

- [ ] Adicionar canal `voicemeeterMidi` no worker de métricas
- [ ] Instanciar `MidiMonitor` no worker
- [ ] Poll a cada 10s quando canal `voicemeeterMidi` ativo (via `self.active("voicemeeterMidi")`)
- [ ] Publicar eventos:
  - `ready` com `MidiDeviceStatus` quando OK
  - `unavailable` quando Voicemeeter não instalado/rodando
  - `error` em falha da API MIDI
- [ ] Backoff exponencial em caso de erro (10s → 30s → 60s → max 5min)
- [ ] Limpar recursos no drop/stop

## Critérios de Aceite

- Canal `voicemeeterMidi` publica status a cada ~10s quando widget ativo
- Backoff funciona corretamente em erros
- Não vaza recursos (memória, handles)

## Dependências

- Issue #32: midi_monitor.rs implementado

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`

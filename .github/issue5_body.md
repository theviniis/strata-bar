## Contexto

Registrar o widget `VoicemeeterMidiStatus` no sistema de configuração para poder habilitar/desabilitar por monitor.

## Tarefas

### Schema de Configuração (`config.schema.json`)

- [ ] Adicionar `voicemeeterMidiStatus` ao objeto `widgets` (nível raiz e por monitor)
- [ ] Propriedades: `enabled: boolean`, `tooltip: boolean`
- [ ] Default: `enabled: false`, `tooltip: true`

### Registro no Runtime (`src-tauri/src/config.rs` ou equivalente)

- [ ] Adicionar widget ao registry de widgets disponíveis
- [ ] Garantir que carrega corretamente no build nativo

### Migração de Config (se necessário)

- [ ] Adicionar defaults no `config::migrate` ou `ConfigStore::open`

## Critérios de Aceite

- Widget aparece nas configurações (página de widgets)
- Pode habilitar/desabilitar por monitor
- Persiste corretamente no arquivo de config
- Default: desabilitado (feature pessoal)

## Dependências

- Issue #35: widget implementado

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`
- Padrão: widgets existentes em `config.schema.json` (ex: `volume`, `microphone`, `gpu`)

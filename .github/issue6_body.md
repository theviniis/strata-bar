## Contexto

No browser studio (`pnpm dev`), o widget deve mostrar estado "Indisponível (apenas nativo)" sem erros.

## Tarefas

### Mock Bridge (`src/services/system/bridge.ts` - `createMockBridge()`)

- [ ] Adicionar `voicemeeterMidi` ao `DemoChannelData`:
  ```typescript
  voicemeeterMidi: {
    status: 'unavailable',
    reason: 'midi_api_error',
    message: 'Disponível apenas no build nativo (pnpm desktop)'
  }
  ```
- [ ] No `subscribe` do mock bridge, para canal `voicemeeterMidi`:
  - Emitir evento `unavailable` com o objeto acima

### Widget - Estado Demo

- [ ] No controller/widget, detectar `bridge.mode === 'demo'`
- [ ] Mostrar estado visual "Indisponível (apenas nativo)" com ícone cinza
- [ ] Popup mostra mensagem explicativa
- [ ] Botão "Reiniciar Audio Engine" desabilitado/oculto no demo

## Critérios de Aceite

- `pnpm dev`: widget carrega sem erros no console
- Widget mostra "Indisponível (apenas nativo)" visualmente
- Popup informa que é feature apenas nativa
- Sem crashes ou warnings React

## Dependências

- Issue #34: bridge types atualizados
- Issue #35: widget implementado

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`
- Padrão: `voicemeeter: null` no `demoChannelData()` atual

## Contexto

Criar o widget React para exibir o status MIDI na barra Strata, seguindo os padrões existentes (volume, microphone, etc.).

## Estrutura de Arquivos

```
src/features/voicemeeter-midi-status/
├── src/
│   ├── voicemeeter-midi-status.widget.tsx      # Widget principal na barra
│   ├── voicemeeter-midi-status.popup.tsx       # Popup com detalhes
│   ├── voicemeeter-midi-status.controller.tsx  # Lógica de estado/ações
│   └── index.ts                                # Exports públicos
├── stories/
│   └── voicemeeter-midi-status.stories.tsx     # Storybook
└── voicemeeter-midi-status.widget.test.tsx     # Testes Vitest + RTL
```

## Tarefas

### Widget Principal (`voicemeeter-midi-status.widget.tsx`)

- [ ] Ícone: teclado MIDI / plug / cabo (usar `lucide-react` icons)
- [ ] Status visual: ponto colorido (verde=conectado, vermelho=desconectado, cinza=checking/unavailable)
- [ ] Tooltip simples com status
- [ ] Click abre popup
- [ ] Segue padrão `volume.widget.tsx` / `microphone.widget.tsx`

### Popup (`voicemeeter-midi-status.popup.tsx`)

- [ ] Título: "Voicemeeter MIDI Status"
- [ ] Nome do dispositivo: "WORLDE easy control"
- [ ] Status detalhado com ícone e texto
- [ ] Última verificação: timestamp formatado
- [ ] Botão "Reiniciar Audio Engine" (desabilitado durante loading)
- [ ] Loading state durante reinicialização (spinner)
- [ ] Fechar ao clicar fora / ESC

### Controller (`voicemeeter-midi-status.controller.tsx`)

- [ ] Subscreve canal `voicemeeterMidi` via `bridge`
- [ ] Expõe estado reativo: `status`, `isRestarting`, `lastError`
- [ ] Ação `restartAudioEngine()` chama `bridge.restartVoicemeeterAudioEngine()`
- [ ] Toast/notification em mudança de status (conectado ↔ desconectado)
- [ ] Cleanup subscription no unmount

### Testes

- [ ] Render widget com cada status (connected, disconnected, checking, unavailable)
- [ ] Popup abre/fecha
- [ ] Botão reiniciar chama bridge corretamente
- [ ] Toast em mudança de status

## Critérios de Aceite

- Widget aparece na barra quando habilitado
- Ícone/cor reflete status real
- Popup mostra detalhes corretos
- Botão "Reiniciar Audio Engine" funciona
- Toast aparece em mudança de status
- Testes passam
- Storybook funcional

## Dependências

- Issue #33: canal voicemeeterMidi no worker
- Issue #34: bridge + comandos Tauri

## Referências

- Plano completo: `docs/plans/voicemeeter-midi-status.md`
- Padrões: `src/features/volume/widget/`, `src/features/microphone/widget/`

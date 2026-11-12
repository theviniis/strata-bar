# Plano Técnico: Monitor de Status MIDI do Worlde Controller no Voicemeeter

## Resumo da Abordagem

### Detecção de Status (Windows MIDI API)

Como o Voicemeeter Remote API **não expõe** o status dos dispositivos MIDI no "M.I.D.I Mapping", usaremos a **Windows MIDI API nativa** (`winmm.dll`):

- `midiInGetNumDevs()` - número de dispositivos MIDI de entrada
- `midiInGetDevCapsW()` - capacidades/nome de cada dispositivo
- Verificar se "WORLDE easy control" está na lista → **Conectado** / **Desconectado**

Vantagens:

- Não depende do Voicemeeter estar rodando
- Detecção instantânea no nível do SO
- Funciona mesmo se Voicemeeter não estiver instalado

### Reinicialização do Audio Engine (Voicemeeter Remote API)

O Voicemeeter aceita o parâmetro especial `Command.Restart` via `VBVMR_SetParameterFloat`:

- Definir `Command.Restart = 1.0` → reinicia o Audio Engine
- Disponível na DLL `VoicemeeterRemote64.dll`
- Não requer automação UI ou PowerShell

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│ Rust (src-tauri/src/midi_monitor.rs) - NOVO MÓDULO             │
├─────────────────────────────────────────────────────────────────┤
│  MidiMonitor                                                     │
│  ├── check_device(device_name: &str) -> MidiDeviceStatus        │
│  └── restart_voicemeeter_audio_engine() -> Result<(), String>   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Rust (src-tauri/src/metrics.rs) - Worker de Métricas            │
├─────────────────────────────────────────────────────────────────┤
│  - Novo canal `voicemeeterMidi`                                 │
│  - Poll a cada 10s quando widget ativo                          │
│  - Publica eventos: ready/unavailable/error                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TypeScript (src/services/system/bridge.ts)                      │
├─────────────────────────────────────────────────────────────────┤
│  - Canal `voicemeeterMidi` em `Channel`                         │
│  - Tipo `MidiDeviceStatus` em `ChannelData`                     │
│  - Comando `restart_voicemeeter_audio_engine`                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ React (src/features/voicemeeter-midi-status/) - NOVA FEATURE    │
├─────────────────────────────────────────────────────────────────┤
│  Widget: VoicemeeterMidiStatusWidget                            │
│  Popup: VoicemeeterMidiStatusPopup                              │
│  Controller: VoicemeeterMidiStatusController                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detalhamento das Mudanças

### 1. Novo Módulo Rust: `src-tauri/src/midi_monitor.rs`

```rust
use std::ffi::{c_void, OsStr};
use std::os::windows::ffi::OsStrExt;
use windows::Win32::Foundation::HINSTANCE;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{LoadLibraryW, FreeLibrary};
use windows::core::PCWSTR;

// Estrutura MIDIINCAPS2W do Windows (para midiInGetDevCapsW)
#[repr(C)]
struct MidiInCaps2W {
    wMid: u16,
    wPid: u16,
    vDriverVersion: u32,
    szPname: [u16; 32],  // MAXPNAMELEN
    dwSupport: u32,
    dwDriverVersion: u32,
    // ... campos adicionais para MIDIINCAPS2
}

pub struct MidiMonitor;

impl MidiMonitor {
    /// Verifica se o dispositivo MIDI está conectado no Windows
    pub fn check_device(device_name: &str) -> Result<MidiDeviceStatus, String> { ... }

    /// Reinicia o Audio Engine do Voicemeeter via Command.Restart
    pub fn restart_voicemeeter_audio_engine() -> Result<(), String> { ... }
}
```

### 2. Integração no `metrics.rs`

```rust
// No worker loop:
let mut midi_monitor = MidiMonitor::new();
let mut midi_due = Instant::now();
let mut midi_active = false;

// Verificar se widget está ativo
if self.active("voicemeeterMidi") && Instant::now() >= midi_due {
    match midi_monitor.check_device("WORLDE easy control") {
        Ok(status) => self.publish(&app, "voicemeeterMidi", envelope("ready", status)),
        Err(e) => self.publish(&app, "voicemeeterMidi", error(e)),
    }
    midi_due = Instant::now() + Duration::from_secs(10);
}
```

### 3. Comandos Tauri (em `main.rs`)

```rust
#[tauri::command]
async fn restart_voicemeeter_audio_engine() -> Result<(), String> {
    MidiMonitor::restart_voicemeeter_audio_engine()
}
```

### 4. Tipos TypeScript (`bridge.ts`)

```typescript
export type MidiDeviceStatus =
  | { status: 'connected'; deviceName: string; lastCheck: number }
  | { status: 'disconnected'; deviceName: string; lastCheck: number; error: string }
  | { status: 'checking'; lastCheck: number }
  | { status: 'unavailable'; reason: 'voicemeeter_not_installed' | 'voicemeeter_not_running' | 'midi_api_error' }

export type Channel =
  | ...
  | 'voicemeeterMidi'

export interface ChannelData {
  ...
  voicemeeterMidi: MidiDeviceStatus
}

// No NativeBridge:
async restartVoicemeeterAudioEngine(): Promise<void>
```

### 5. Widget React (`src/features/voicemeeter-midi-status/`)

Estrutura seguindo convenções existentes:

```
src/features/voicemeeter-midi-status/
├── src/
│   ├── voicemeeter-midi-status.widget.tsx      # Widget principal na barra
│   ├── voicemeeter-midi-status.popup.tsx       # Popup com detalhes
│   ├── voicemeeter-midi-status.controller.tsx  # Lógica de estado
│   ├── voicemeeter-midi-status.styles.css      # Estilos (se necessário)
│   └── index.ts                                # Exports
├── stories/
│   └── voicemeeter-midi-status.stories.tsx     # Storybook
└── voicemeeter-midi-status.widget.test.tsx     # Testes
```

**Widget na barra:** Ícone pequeno (teclado MIDI / plug) + cor de status (verde/vermelho/cinza)
**Popup:** Nome do dispositivo, status detalhado, última verificação, botão "Reiniciar Audio Engine", loading state

---

## Issues para GitHub

### Issue 1: Core - MIDI Monitor Rust Module

**Título:** `feat: add midi_monitor.rs for Worlde Controller status detection`
**Labels:** `feature`, `rust`, `native`
**Descrição:**

- Criar `src-tauri/src/midi_monitor.rs`
- Implementar `check_device(device_name)` usando `winmm.dll` (midiInGetNumDevs, midiInGetDevCapsW)
- Implementar `restart_voicemeeter_audio_engine()` via `Command.Restart = 1.0` na VoicemeeterRemote64.dll
- Adicionar testes unitários
- Registrar módulo em `src-tauri/src/lib.rs` ou `main.rs`

### Issue 2: Core - Metrics Worker Integration

**Título:** `feat: integrate voicemeeterMidi channel in metrics worker`
**Labels:** `feature`, `rust`, `native`
**Descrição:**

- Adicionar canal `voicemeeterMidi` no worker de métricas (`metrics.rs`)
- Poll a cada 10s quando canal ativo
- Publicar eventos `ready`/`unavailable`/`error` com `MidiDeviceStatus`
- Backoff exponencial em caso de erro

### Issue 3: Core - Tauri Commands & Bridge

**Título:** `feat: add voicemeeterMidi channel to bridge and Tauri commands`
**Labels:** `feature`, `typescript`, `tauri`
**Descrição:**

- Adicionar `voicemeeterMidi` ao tipo `Channel` em `bridge.ts`
- Adicionar `MidiDeviceStatus` a `ChannelData`
- Adicionar comando `restart_voicemeeter_audio_engine` no Tauri
- Atualizar `NativeBridge` com método `restartVoicemeeterAudioEngine`

### Issue 4: Frontend - Widget & Popup

**Título:** `feat: create VoicemeeterMidiStatus widget with popup`
**Labels:** `feature`, `react`, `ui`, `widget`
**Descrição:**

- Criar feature `voicemeeter-midi-status` em `src/features/`
- Widget: ícone na barra com status colorido (verde/vermelho/cinza)
- Popup: detalhes do dispositivo, última verificação, botão "Reiniciar Audio Engine"
- Loading state durante reinicialização
- Toast/notification em mudança de status
- Seguir padrões de `volume`, `microphone` widgets

### Issue 5: Config - Widget Registration

**Título:** `feat: register VoicemeeterMidiStatus widget in config`
**Labels:** `feature`, `config`
**Descrição:**

- Adicionar widget ao schema de configuração
- Permitir habilitar/desabilitar por monitor
- Default: desabilitado (feature pessoal)

### Issue 6: Demo - Browser Studio Fallback

**Título:** `feat: add demo fallback for voicemeeterMidi in browser studio`
**Labels:** `feature`, `demo`, `studio`
**Descrição:**

- No `createMockBridge()`: `voicemeeterMidi` retorna `{ status: 'unavailable', reason: 'midi_api_error' }` com mensagem "Apenas disponível no build nativo"
- Widget mostra estado "Indisponível (apenas nativo)" no `pnpm dev`

---

## Critérios de Validação

### Native (`pnpm desktop`)

- [ ] Widget aparece apenas quando Voicemeeter instalado
- [ ] Status "Conectado" (verde) quando "WORLDE easy control" detectado
- [ ] Status "Desconectado" (vermelho) quando dispositivo removido
- [ ] Botão "Reiniciar Audio Engine" reinicia engine do Voicemeeter
- [ ] Toast/notification em mudança de status
- [ ] Poll a cada 10s, backoff em erro

### Browser Studio (`pnpm dev`)

- [ ] Widget mostra "Indisponível (apenas nativo)"
- [ ] Sem erros no console

### Testes

- [ ] Unit tests Rust: `midi_monitor.rs` (mock winmm/Voicemeeter)
- [ ] Unit tests TypeScript: bridge, controller
- [ ] Integration test: widget render + status changes

---

## Riscos Conhecidos

1. **winmm.dll não disponível** - Extremamente improvável (parte do Windows base)
2. **Nome do dispositivo difere** - Mitigado: nome confirmado "WORLDE easy control"
3. **Command.Restart não funciona** - Fallback: documentar reinicialização manual
4. **Permissões** - Voicemeeter Remote API não requer admin; winmm não requer admin

---

## Estimativa

| Issue                      | Esforço | Dependências |
| -------------------------- | ------- | ------------ |
| 1. MIDI Monitor Rust       | 3-4h    | -            |
| 2. Metrics Integration     | 2h      | #1           |
| 3. Tauri Commands & Bridge | 2h      | #1           |
| 4. Widget & Popup          | 4-5h    | #2, #3       |
| 5. Config Registration     | 1h      | #4           |
| 6. Demo Fallback           | 1h      | #3           |

**Total estimado:** ~13-15h

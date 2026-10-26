# Validando roteamento de áudio (volume/microphone) com Voicemeeter

**Feature**: Issue #7 - Audio widgets obey configured source and target on startup and config events.

Este guia explica como testar manualmente a funcionalidade de roteamento de áudio com Voicemeeter, garantindo que:

1. As mudanças de configuração são aplicadas no startup e em eventos de configuração
2. O comportamento "last-write-wins" é preservado
3. Não há fallback silencioso para Windows ou demo quando Voicemeeter está ausente

---

## Requisitos prévios

- Windows 11
- Voicemeeter Banana x64 instalado e configurado
- Strata rodando em modo nativo (`pnpm desktop`)
- Editor de texto para editar o arquivo de configuração

---

## Guia de validação manual

### 1. Validar que a configuração é aplicada no startup

#### Passo 1: Configure o volume para usar Voicemeeter

1. Edite o arquivo de configuração (`%APPDATA%\strata\config.json` ou onde o native armazena)
2. Localize o widget de volume e adicione a seção `audio`:

```json
{
  "id": "volume",
  "type": "volume",
  "audio": {
    "source": "voicemeeter",
    "target": { "kind": "bus", "index": 0 },
    "label": "A1 fones"
  }
}
```

3. Salve o arquivo
4. Feche o Strata e reabra (`pnpm desktop`)

#### Expected result

- O widget de volume (na barra) deve mostrar "**A1 fones**" (se o label estiver configurado) ou "**Bus 0**" (se não houver label)
- O tooltip (hover) do widget deve mostrar "**Voicemeeter: A1 fones**"
- Ao clicar no widget, o popup de saída de áudio deve indicar "**Voicemeeter: A1 fones**" como fonte
- O slider e o botão de mute devem controlar a Bus 0 do Voicemeeter (não o Windows)
- O slider e o botão de mute devem controlar o Voicemeeter, não o Windows

#### Troubleshooting

- Se o widget mostrar "Windows" ou "Default Output", a configuração não foi lida corretamente
- Verifique se o JSON é válido (sem vírgulas extras)
- Verifique os logs para erros de carregamento de configuração

---

### 2. Validar que mudanças de configuração são aplicadas em tempo real

#### Passo 1: Mude o alvo de Voicemeeter

1. Enquanto o Strata está rodando, edite o arquivo de configuração
2. Mude o índice do alvo de `0` para `1`:

```json
"target": { "kind": "bus", "index": 1 }
```

3. Salve o arquivo

#### Expected result

- O widget (na barra) deve atualizar para mostrar "**Bus 1**" (ou o label configurado)
- O tooltip/hover deve mostrar "**Voicemeeter: Bus 1**"
- O popup deve indicar que agora está controlando "**Bus 1**"
- O slider/mute agora controlam a Bus 1 do Voicemeeter

#### Passo 2: Mude para Windows

1. Edite a configuração e remova a seção `audio` ou mude `source` para `"windows"`

```json
"audio": {
  "source": "windows"
}
```

#### Expected result

- O widget deve indicar que está usando "Windows" ou "Default Output"
- O slider/mute devem controlar o endpoint padrão do Windows
- O popup deve mostrar a lista de dispositivos de saída do Windows

---

### 3. Validar last-write-wins com múltiplas mudanças rápidas

#### Passo 1: Faça múltiplas mudanças rápidas

1. Edite o arquivo de configuração e alterne entre diferentes alvos:

```json
// Mudança 1: Bus 0
"target": { "kind": "bus", "index": 0 }

// Mudança 2: Bus 1
"target": { "kind": "bus", "index": 1 }

// Mudança 3: Bus 2
"target": { "kind": "bus", "index": 2 }
```

Salve após cada mudança (ou use "Save All" do seu editor)

#### Expected result

- A última mudança deve prevalecer
- Se você deixou a configuração em "Bus 2", o widget deve controlar a Bus 2
- Não há "oscilação" entre os valores; cada evento de configuração sobrescreve o anterior

#### Passo 2: Teste com widget desabilitado

1. Desabilite o widget de volume (`"enabled": false`)
2. Edite o alvo para "Bus 3"
3. Reabilite o widget (`"enabled": true`)

#### Expected result

- O widget deve restaurar o alvo configurado ("Bus 3") quando reabilitado
- O alvo não deve ser perdido durante o tempo em que o widget estava desabilitado

---

### 4. Validar comportamento quando Voicemeeter está ausente

#### Passo 1: Configure para usar Voicemeeter

1. Configure o widget de volume para usar Voicemeeter (como no passo 1 do teste 1)

#### Passo 2: Feche Voicemeeter

1. Feche completamente o aplicativo Voicemeeter
2. Aguarde 2-3 segundos (tempo de polling)

#### Expected result

- O widget deve mostrar "Voicemeeter não está em execução"
- O popup deve indicar que o recurso está indisponível
- O widget não deve "cair" silenciosamente para o Windows
- O slider deve estar desabilitado (se possível)

#### Passo 3: Reabra Voicemeeter

1. Reabra o aplicativo Voicemeeter
2. Aguarde 2-3 segundos

#### Expected result

- O widget deve recuperar o controle de Voicemeeter automaticamente
- O estado anterior (qualquer que seja) deve ser restaurado

---

### 5. Validar widget de microfone

#### Passo 1: Configure o microfone

1. Edite a configuração e configure o widget de microfone:

```json
{
  "id": "microphone",
  "type": "microphone",
  "audio": {
    "source": "voicemeeter",
    "target": { "kind": "strip", "index": 0 },
    "label": "Mic 0"
  }
}
```

#### Expected result

- O widget (na barra) deve mostrar "**Mic 0**" (ou "Strip 0" se não houver label)
- O tooltip/hover deve mostrar "**Voicemeeter: Mic 0**"
- O popup deve indicar que está controlando "**Strip 0**"
- O slider/mute devem controlar a Strip 0 do Voicemeeter

#### Passo 2: Alterne entre Voicemeeter e Windows

1. Alterne entre `source: "voicemeeter"` e `source: "windows"`
2. Verifique que o widget reage corretamente a cada mudança

---

### 6. Validar que configurações persistem após restart

#### Passo 1: Configure um alvo

1. Configure o volume para usar Voicemeeter com um alvo específico

#### Passo 2: Feche e reabra Strata

1. Feche o Strata
2. Reabra (`pnpm desktop`)

#### Expected result

- A configuração deve persistir (não perder)
- O widget deve mostrar o mesmo alvo configurado anteriormente
- O comportamento deve ser idêntico ao do passo inicial

---

## Configuração completa de exemplo

Para testar o roteamento de áudio com Voicemeeter, adicione esta configuração completa ao seu arquivo `config.json`:

```json
{
  "version": 1,
  "bar": {
    "position": "bottom",
    "height": 36,
    "spacing": 8,
    "theme": "dark"
  },
  "widgets": {
    "left": [
      { "id": "workspaces", "type": "workspaces" },
      { "id": "active", "type": "activeWindow" }
    ],
    "center": [{ "id": "time", "type": "clock" }],
    "right": [
      {
        "id": "volume",
        "type": "volume",
        "audio": {
          "source": "voicemeeter",
          "target": { "kind": "bus", "index": 0 },
          "label": "A1 fones"
        }
      },
      {
        "id": "microphone",
        "type": "microphone",
        "audio": {
          "source": "voicemeeter",
          "target": { "kind": "strip", "index": 0 },
          "label": "Mic 0"
        }
      }
    ]
  }
}
```

---

## Checklist de validação

- [ ] **Startup**: Configuração de Voicemeeter é aplicada no startup
- [ ] **Runtime**: Mudanças de configuração são aplicadas em tempo real
- [ ] **Last-write-wins**: Última mudança prevalece em múltiplas edições rápidas
- [ ] **No fallback**: Quando Voicemeeter está ausente, o widget mostra erro (não cai no Windows)
- [ ] **Recuperação**: Quando Voicemeeter retorna, o widget se recupera automaticamente
- [ ] **Microphone**: Widget de microfone obedece à mesma lógica de roteamento
- [ ] **Persistência**: Configurações persistem após restart
- [ ] **Widget desabilitado**: Alvo é preservado quando widget está desabilitado

---

## Comandos úteis

```powershell
# Verificar se Voicemeeter está rodando
Get-Process Voicemeeter*

# Verificar logs do Strata (se disponível)
# Verificar configuração atual (localização típica)
# %APPDATA%\strata\config.json

# Rodar testes frontend
pnpm test

# Rodar testes Rust
cd src-tauri
cargo test
```

---

## Problemas conhecidos e soluções

### "Voicemeeter não está em execução"

- Verifique se Voicemeeter Banana está rodando
- Verifique se a DLL do Voicemeeter está instalada
- Reinicie o Strata para reconectar à sessão

### Configuração não é aplicada

- Verifique a validade do JSON (use um validador online)
- Verifique se o ID do widget está correto
- Verifique os logs de erro no console do Tauri

### Slider/mute não controla Voicemeeter

- Verifique se `source` está definido como `"voicemeeter"`
- Verifique se `target` tem `kind` e `index` válidos
- Verifique se o widget está habilitado (`enabled: true`)

---

## Próximos passos

Após validação manual:

1. Atualizar `docs/evidence/` com resultados reais
2. Documentar comportamento em ambiente real
3. Criar screenshot/recordings para documentação
4. Considerar automação do teste com Cypress/Playwright (futuro)

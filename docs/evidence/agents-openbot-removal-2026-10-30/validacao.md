# Validação da remoção de OpenBot — 30/10/2026

Escopo: remoção de OpenBot do widget Agents e compatibilidade de configurações
anteriores. Orion atualizou contratos/produção; Vega atualizou testes e executou
gates; Kepler revisou independentemente os testes e a compatibilidade.
Evidências anteriores em `agents-refactor-2026-10-30` foram preservadas.

## Resultado

- `cargo test --manifest-path src-tauri/Cargo.toml`: **código 0**, 242 testes
  aprovados, 29 ignorados e zero falhas; 48,68 s incluindo compilação.
- Testes Vitest direcionados: **6 arquivos, 88 testes aprovados**, código 0,
  188,68 s. Após a revisão, a confirmação dos dois arquivos de UI passou com
  **2 arquivos, 24 testes aprovados**, código 0, 10,52 s.
- `pnpm check`: **código 0**, Prettier, ESLint, TypeScript e Vitest aprovados;
  **99 arquivos e 662 testes**, zero falhas, 451,81 s na fase Vitest.
- `pnpm build`: **código 0**, build Vite concluído em 42,52 s. Permaneceram
  avisos do Rollup sobre anotações Zod e chunk acima de 500 kB.
- `cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol`:
  **código 0**, build nativo Windows concluído em 18,46 s após o frontend.
- `--check-agents`: **código 0**, smoke nativo aprovado com metadados sintéticos
  claramente identificados e transporte real do helper Codex, TCP local,
  worker nativo, IPC Tauri, WebView2 e Win32. Confirmou estado normal sem
  destaque, atenção com contador 1 e popup, foco preservado, fechamento
  explícito sem reabertura duplicada, resolução para normal e abertura em novo
  episódio. Snapshot de contrato versão 10.
- `--probe-agents` antes e depois do smoke: as aplicações são exatamente
  `opencode` e `codex`; ambas foram detectadas como em execução nesta máquina.
  Os dois provedores estavam desabilitados no probe, sem sessões/hooks pessoais.
- `--probe` antes/depois: as áreas de trabalho Win32 foram restauradas
  exatamente. A instalação existente (PID 7628) não foi encerrada nem teve
  configuração tocada.

Relatórios e snapshots: [native-smoke.json](native-smoke.json),
[native-smoke-stale-bundle.json](native-smoke-stale-bundle.json),
[providers-before.json](providers-before.json),
[providers-after.json](providers-after.json),
[monitors-before.json](monitors-before.json) e
[monitors-after.json](monitors-after.json).

## Comandos

```powershell
node node_modules/vitest/vitest.mjs run src/tests/agents.test.tsx src/tests/agents-visibility.test.tsx src/tests/agents-store.test.ts src/tests/agents-attention.test.ts src/tests/codex-agents.test.tsx src/tests/settings-view.test.tsx --maxWorkers=1
node node_modules/vitest/vitest.mjs run src/tests/agents-visibility.test.tsx src/tests/agents.test.tsx --maxWorkers=1
cargo test --manifest-path src-tauri/Cargo.toml
pnpm check
pnpm build
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
Start-Process src-tauri/target/debug/strata-bar.exe -ArgumentList '--check-agents' -WindowStyle Hidden -Wait -PassThru
src-tauri/target/debug/strata-bar.exe --probe-agents
src-tauri/target/debug/strata-bar.exe --probe
```

## Incidente de ordem do build

A primeira execução do smoke falhou com timeout ao aguardar atenção. A inspeção
read-only mostrou que o executável embutira `index-ColR1rFo.js`, enquanto
`dist/index.html` já apontava para `index-DoBmHeXf.js`: frontend e compilação
nativa haviam sido iniciados em paralelo, e o macro de contexto Tauri leu o
bundle anterior. O relatório foi preservado em
`native-smoke-stale-bundle.json`. Em seguida, o build nativo foi executado
depois do build frontend; confirmou-se que EXE e `dist/index.html` apontavam
para `index-DoBmHeXf.js`, e o smoke passou. Não houve mudança de produção ou
do harness para contornar essa falha.

## Compatibilidade e revisão

O teste `drops the obsolete OpenBot visibility while retaining provider
settings and layout` cobre parsing de configuração anterior com o campo antigo:
o campo é descartado, a visibilidade de Codex/OpenCode restante e o layout são
preservados. As fixtures e asserts restantes de Agents foram atualizadas para
os dois provedores suportados. Kepler aprovou sem achados pendentes; sua sugestão
de garantir que o tab Codex oculto desaparece foi incluída e retestada.

## Limitações

Os metadados das sessões de smoke são sintéticos; não houve interação com sessão
real nem execução de modelo. O transporte e a UI exercitados são os caminhos
nativos reais. A observação de processos refletiu apenas o estado desta máquina.
Não foram exercitados fullscreen, DPI misto, remoção física de monitor ou
reinício do Explorer.

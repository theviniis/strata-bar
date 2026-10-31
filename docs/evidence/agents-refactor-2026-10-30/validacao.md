# Validação da refatoração de Agents — 30/10/2026

Escopo: STR-6 e STR-7 no Linear, com base em `2d99a34`. A árvore inicial
estava limpa. Orion implementou a remoção e os contratos; Vega atualizou os
testes; Kepler revisou independentemente; Atlas executou o smoke nativo e
consolidou as evidências. Não houve commit, push ou alteração da instalação.

## Resultado nativo

O comando abaixo terminou com código 0, usando frontend embarcado:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
Start-Process src-tauri/target/debug/strata-bar.exe --check-agents -WindowStyle Hidden -Wait
```

O harness é exclusivo de debug e usa mutex, configuração, lembretes, hooks e
perfil WebView2 isolados. Os metadados de sessão são sintéticos e explicitamente
identificados; percorrem o helper Codex, TCP local, worker real, IPC Tauri,
WebView2 e janela Win32. Não foi usado o adapter demo nem executado um modelo.

Em dois monitores a 96 DPI, o smoke confirmou:

- Widget visível, inicialmente sem `text-destructive`.
- `PermissionRequest` produz sessão em `attention`, contador 1 e destaque.
- Popup `agentsAlert` apresenta a sessão e fica visível no HWND sem tomar foco.
- Segunda sessão chega com popup aberto; fechar explicitamente não reabre o
  mesmo episódio após o próximo ciclo nativo.
- `Stop` nas duas sessões restaura o estado normal.
- Novo turno produz novo popup; resolver a atenção fecha a janela automaticamente.
- Contrato nativo com versão 10.

O relatório integral está em [native-smoke.json](native-smoke.json). As quatro
barras enumeradas incluem duas da instalação já existente e duas temporárias do
harness; não representam quatro barras criadas pela instância de teste.

Após sair, `--probe` confirmou restauração exata das áreas de trabalho:
`[0,34,3440,1440]` e `[756,-1046,2676,0]`. A instalação em
`C:\Program Files\Strata\strata-bar.exe` permaneceu no PID 7628. Veja
[geometry-before.json](geometry-before.json) e
[geometry-after.json](geometry-after.json). Os retângulos vêm de Win32.

`--probe-agents` confirmou processos reais Codex/OpenCode e OpenBot com
`running: null`, estado `disabled` e motivo explícito de indisponibilidade.
Esse probe de observação não habilita monitores nem altera hooks pessoais. Veja
[native-providers.json](native-providers.json).

## Implementação e revisão

Removidos os dois provedores antigos de contratos, configuração, hooks, CLI,
IPC, fixtures, testes e documentação ativa. A busca em `src`, `src-tauri`,
`scripts` e `docs/plans`, excluindo outputs de build, só encontra o domínio da
documentação oficial de hooks do Codex (`learn.chatgpt.com`), que não é um
provedor do widget. Evidências históricas anteriores foram preservadas.

Codex e OpenCode permanecem disponíveis. OpenBot é somente contrato futuro e
indisponibilidade explícita. O layout padrão inclui Agents; layouts persistidos
continuam preservados. A compatibilidade de configuração foi verificada com
`parseConfig` sobre o documento padrão anterior: versão, layout e preferências
de Codex/OpenCode preservados; campos removidos descartados; novos IDs únicos.

A revisão corrigiu a deduplicação de sessões adicionais enquanto o popup está
visível. O reconhecimento exige popup apresentado e fora de fechamento. O
dispatch prefere a barra primária com Agents habilitado, com fallback para
outra barra configurada; sem barras elegíveis, limpa a deduplicação antiga.

Na revisão incremental dos testes, a fixture de Settings foi ajustada para
retirar Agents das três seções antes de reposicioná-lo, evitando ID duplicado
com o novo layout padrão. O mock de disponibilidade foi removido para exercitar
a flag real. Kepler concluiu a revisão final sem achados pendentes nos eixos
Standards e Spec.

## Verificações

- `cargo check --manifest-path src-tauri/Cargo.toml`: aprovado.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`: executado.
- Geração dos contratos Rust → TypeScript, schema e registry de popups: aprovada.
- ESLint direcionado à implementação: aprovado.
- `pnpm build`: aprovado; avisos de anotações de dependência Zod e tamanho de
  chunk, sem falha de build.
- Vitest direcionado a Agents: 43 testes aprovados em seis arquivos; uma
  segunda rodada, incluindo config/widget-flags e CPU/GPU, aprovou 70 testes em
  dez arquivos.
- Cenários de Agents em Settings após correção da fixture: 5 aprovados,
  47 outros testes não selecionados nessa execução direcionada, em 36,70 s.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **242 aprovados,
  29 ignorados, zero falhas** na execução final. Uma execução anterior falhou
  em `network_speed::tests::download_deadline_keeps_partial_bytes_without_a_body_error`
  por erro de envio a localhost. O teste isolado e a suíte completa repetida
  passaram, sem alteração da implementação de rede; registrado como ocorrência
  transitória, não como falha preexistente comprovada em outra revisão.
- `pnpm typecheck`: aprovado.
- `pnpm check`: **código 0**. Prettier, ESLint, TypeScript e Vitest passaram;
  suíte completa em **99 arquivos, 662 testes aprovados, zero falhas**, em
  416,78 s. Os avisos de `scrollTo()` no jsdom não falharam o gate.
- `pnpm test` não foi repetido à parte: `pnpm check` executa o mesmo `vitest
  run` completo, que passou nessa execução final.

A primeira execução completa de `pnpm check` chegou ao Vitest após passar
geração, Prettier, ESLint e TypeScript. Resultado inicial: 99 arquivos,
662 testes, 652 aprovados e 10 falhas em cinco arquivos. Oito falhas eram
expectativas/fixtures diretamente afetadas pela mudança de Agents (cinco em
Settings, duas de feature flag e uma de layout padrão); foram atualizadas e
confirmadas por testes direcionados. As duas restantes eram as asserções de
CPU/GPU comprovadas no baseline abaixo e foram corrigidas apenas nas queries.
O gate final completo passou após esses ajustes.

As falhas de `cpu-temperature-sampling.test.tsx` (texto `42.0 °C`) e
`gpu-controlled.test.tsx` (texto `27.3%`) foram reproduzidas em `HEAD` isolado
por `git archive`, sem checkout da árvore de trabalho. Comando no diretório
temporário:

```powershell
node D:/code/strata/node_modules/vitest/vitest.mjs run src/tests/cpu-temperature-sampling.test.tsx src/tests/gpu-controlled.test.tsx --maxWorkers=1
```

Resultado no baseline: 2 falhas e 8 aprovações em 21,96 s. A UI já apresenta o
valor em `output` e a unidade no cabeçalho; as queries antigas buscavam ambos
em um único texto. A correção é restrita às asserções, preservando valor e
unidade e sem alterar a implementação de CPU/GPU.

## Limitações

Não houve execução real de modelo, interação com sessões pessoais ou validação
de backend OpenBot, ainda indefinido. Fullscreen, DPI misto, remoção física de
monitor e reinício do Explorer não foram exercitados ao vivo nesta rodada.
Os estados futuros de OpenBot são cobertos por fixtures, não por integração
inexistente. Não foi medido idle, pois esta alteração não tem critério de
performance e o smoke envolve atividade deliberada. O script genérico de
geometria não foi executado: ele presume uma única instância global, enquanto
o smoke isolado coexistiu com a instalação. A restauração foi conferida por
`--probe` antes/depois e igualdade das áreas Win32, conforme os JSONs anexos.

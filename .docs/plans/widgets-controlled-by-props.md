# Widgets e popups controlados integralmente por props

## Resumo

Separar todos os widgets, previews e popups em duas partes: um **pai
controlador**, responsável pelo funcionamento, e um **visual**, que recebe todas
as dependências por props.

Cada widget terá seu próprio controlador para preservar assinaturas independentes
e evitar que uma atualização de CPU renderize toda a barra.

## Mudanças

- Mover para os controladores as subscriptions, leituras de stores/contextos,
  timers, chamadas ao bridge, efeitos, refs e estados de interação.
- Incluir nessa separação todos os widgets registrados, conteúdos de popups e
  controles específicos dessas features.
- Tornar os visuais funções de suas props: sem hooks, acesso a stores/contextos,
  consultas ao ambiente ou chamadas diretas a serviços. Cálculos puros de
  apresentação podem permanecer.
- Fornecer por props dados, configuração, estados de carregamento/erro, valores
  de formulários, seleção, abertura, operações pendentes, callbacks e refs
  necessários.
- Manter hooks e estado internos das bibliotecas e primitivas genéricas de UI;
  os estados de interação pertencentes à feature serão controlados pelo pai.
- Colocar tooltip, trigger, anchor e integração com `WidgetPopup` na composição
  controladora, passando aos visuais os atributos, callbacks e refs
  correspondentes.
- Substituir o consumo implícito de `WidgetViewContext` e `WidgetPreviewContext`
  nos visuais por props explícitas.
- Usar os mesmos visuais nos modos nativo e preview. Os controladores escolhem a
  fonte apropriada; previews inertes não iniciam efeitos nativos.

## Interfaces e integração

- Definir props específicas e obrigatórias para cada visual, reutilizando tipos
  dos contratos existentes. Evitar um objeto genérico com dependências de todos
  os widgets.
- Manter os nomes visuais, como `Cpu`, para componentes que recebem props; usar
  nomes como `CpuController` nos pontos de integração.
- Atualizar o registro de widgets para renderizar controladores. Manter a
  composição, ordem e configuração da barra.
- Manter os registros de popups apontando para controladores compatíveis com o
  host atual. Cada janela resolve suas próprias dependências; callbacks não
  atravessam o transporte nativo.
- Preservar contratos do bridge, configuração persistida e comandos Rust. Não
  adicionar fallback demo em falhas nativas.
- Remover implementações visuais duplicadas de preview onde forem substituídas
  pelo visual compartilhado.

## Validação

- Testar visuais diretamente por props: carregamento, sucesso,
  indisponibilidade, erro, leitura desatualizada e configuração de apresentação.
- Verificar callbacks e estados controlados: clique, teclado, seleção,
  formulários, operações pendentes, falhas e fechamento.
- Testar nos controladores subscriptions e limpeza, mudanças de configuração,
  timers e isolamento de atualizações entre widgets.
- Confirmar que previews inertes não executam ações ou subscriptions nativas.
- Adaptar os testes existentes sem reduzir suas verificações; executar
  `pnpm check` e distinguir eventuais falhas preexistentes.
- Validar na aplicação Windows tooltip, popup, foco, Escape, áudio e ações dos
  widgets, preservando posicionamento e comportamento da overlay.

## Storybook para preview isolado

Adicionar Storybook com o framework `@storybook/react-vite` para visualizar os
widgets e popups por suas props, acompanhando a migração de cada feature.
Referência: [instalação oficial](https://storybook.js.org/docs/get-started/install).

- Configurar scripts `storybook` e `build-storybook`, usando pnpm para instalar
  dependências e regenerar o lockfile.
- Reutilizar Tailwind, estilos globais, fontes e alias `@/`. Manter a configuração
  de desenvolvimento do Storybook independente da porta e dos plugins de geração
  específicos da aplicação.
- Criar stories junto às features, renderizando os visuais compartilhados com
  fixtures tipadas e determinísticas e callbacks simulados. Não iniciar bridge,
  subscriptions, stores conectadas ou comandos nativos nas stories.
- Oferecer temas claro e escuro, formatos compacto e com label, além dos estados
  de carregamento, sucesso, indisponibilidade, erro e leitura desatualizada quando
  aplicáveis.
- Usar pequenos pais de demonstração nas stories interativas para controlar
  formulários, seleção, sliders e abertura por props. Manter os visuais sem estado.
- Mostrar popups em uma composição de demonstração que forneça tamanho, tema e
  estado controlado, sem depender da janela overlay nativa.
- Manter o studio e a validação nativa existentes. O Storybook verifica a
  apresentação isolada; geometria Win32, integração e comportamento da AppBar
  continuam exigindo validação na aplicação Windows.

## Passos de implementação

Executar na ordem abaixo. Cada migração de feature inclui o widget, seus popups,
controles específicos e testes correspondentes. Marcar uma etapa somente após
verificar seu resultado.

### Regra de acompanhamento pelo agente

O agente responsável pela implementação deve manter este arquivo atualizado
durante a execução, ao concluir cada etapa e antes de encerrar uma sessão de
trabalho. Não deixar a atualização da documentação para o fim da implementação.

- Marcar com `[x]` cada checkbox somente quando a etapa estiver concluída e seu
  resultado verificado; manter `[ ]` nas etapas parciais ou bloqueadas.
- Documentar na seção **Registro de execução** os dados de cada etapa percorrida:
  data, etapa, alterações realizadas, arquivos relevantes, comandos de validação
  executados e respectivos resultados.
- Registrar falhas, bloqueios, limitações, decisões e desvios do plano, incluindo
  o que ainda falta para concluir uma etapa parcial.
- Ao encerrar uma sessão, registrar o próximo passo para permitir a continuidade
  do trabalho por outro agente sem depender do histórico do chat.

### Checklist

- [x] Inventariar todos os widgets registrados, previews, popups e controles
      associados, incluindo placeholders de funcionalidades indisponíveis.
- [x] Registrar as dependências atuais de cada feature: dados, configuração,
      ações, contextos, timers, refs e estados de UI.
- [x] Executar os checks existentes e registrar as falhas anteriores à migração
      para comparar os resultados finais.
- [x] Definir o padrão de controlador e visual com props obrigatórias, tipos
      derivados dos contratos existentes e callbacks para todas as interações.
- [x] Preparar a composição controladora de tooltip, popup, trigger e anchor,
      preservando atributos de acessibilidade, refs, foco e fechamento.
- [x] Instalar e configurar Storybook para React e Vite, incluindo scripts,
      estilos, fontes, alias e alternância entre temas claro e escuro.
- [x] Migrar CPU como primeira aplicação completa do padrão, incluindo popup,
      preview e testes, antes de repetir a estrutura nas demais features.
- [x] Criar as stories de CPU e de seu popup como referência; adicionar as
      stories e estados correspondentes durante cada migração abaixo.
- [x] Migrar memória, incluindo gráfico e popup.
- [x] Migrar GPU, incluindo popup e estados de métricas indisponíveis.
- [x] Migrar discos, incluindo lista de volumes e popup.
- [x] Migrar relógio, incluindo timers, calendário e popup.
- [x] Migrar volume e microfone, incluindo roteamento, seleção de dispositivos,
      sliders, mute e estados pendentes/erro dos popups.
- [x] Migrar komorebi, incluindo seleção de workspace e estados offline.
- [x] Migrar música, incluindo progresso, busca de posição, controles de
      reprodução e configurações presentes no popup.
- [x] Migrar lembretes, incluindo editor, formulários, calendário, alertas e
      ações de adiar e dispensar.
- [x] Migrar agentes, incluindo listas de sessões, perguntas, permissões,
      alertas e ações do popup.
- [x] Adequar os placeholders de rede e janela ativa ao mesmo contrato explícito
      de apresentação, mantendo sua indicação de indisponibilidade.
- [x] Concluir a integração dos controladores nos registros de widgets e popups,
      mantendo dependências resolvidas separadamente por janela.
- [x] Unificar os visuais usados pela barra e pelos previews; verificar que o
      preview inerte não inicia subscriptions ou ações nativas.
- [x] Remover consumos implícitos de contexto dos visuais e eliminar contextos,
      wrappers e implementações de preview que ficaram sem uso.
- [x] Revisar todos os visuais e seus controles específicos para confirmar que
      recebem suas dependências por props e não mantêm hooks ou estado próprio.
- [x] Validar cleanup, mudanças de configuração e isolamento de renderização
      entre widgets, além dos cenários descritos na seção de validação.
- [x] Executar `pnpm check`, corrigir regressões introduzidas e registrar
      separadamente eventuais falhas preexistentes ainda presentes.
- [ ] Executar `pnpm build-storybook` e revisar as stories de todos os widgets e
      popups nos dois temas, incluindo interações e estados de erro.
- [x] Documentar os comandos do Storybook e como adicionar stories de novas
      features; ignorar seu diretório de saída gerado no Git e nos checks de fonte.
- [ ] Validar a barra nativa no Windows: tooltip, popup, foco, Escape, áudio,
      ações e posicionamento da overlay; registrar resultados e limitações.

## Registro de execução

Preencher durante a implementação com uma entrada por etapa ou atualização
relevante, usando o formato abaixo. As entradas desta execução estão ao final da seção.

```markdown
### AAAA-MM-DD — Etapa

- Status: em andamento | concluída | bloqueada
- Alterações e arquivos relevantes:
- Validações e resultados:
- Decisões, desvios ou bloqueios:
- Pendências e próximo passo:
```

### 2026-10-22 — Inventário e início da referência CPU

- Status: em andamento.
- Inventário: 13 registros em `src/components/status-bar/widget.tsx`: CPU, memória, GPU, disco, relógio, volume, microfone, komorebi, música, lembretes, agentes, rede e janela ativa. Os dois últimos são placeholders. Popups: CPU, memória, GPU, disco, relógio, audioOutputs, audioInputs, música, lembretes, reminderAlert e agentes; controles relacionados estão nos diretórios das features.
- Dependências: recursos usam `useResourceChannel` (subscription, retenção e timer de freshness); relógio usa `useTime`; áudio usa `useSystemChannel`, bridge e estado de dispositivos; komorebi usa canal, bridge e refs/animação de Workspaces; música usa canal, adapter demo, identidade de faixa, pending, progresso e configurações Spotify; lembretes usam store, relógio, anchor, editor e integração Calendar; agentes usam stores, configuração de visibilidade, conexão e estado das perguntas/permissões. Todos os widgets leem WidgetViewContext; previews inertes usam WidgetPreviewContext. Tooltip e popup têm refs e integração próprias. Popups resolvem dependências por janela via PopupContext.
- Baseline: `pnpm check` passou Prettier, ESLint e TypeScript antes das alterações; Vitest descobriu checkouts em `.worktrees` e falhou em suites externas. Limitada a descoberta a `src/tests/**/*.test.{ts,tsx}` e ignoradas `.worktrees` no ESLint. Não atribuir essas falhas à migração.
- CPU: `CpuController` resolve canal/configuração/tooltip/popup; `Cpu` recebe props explícitas; `CpuPopupController` resolve o modo da janela e `CpuPopup` é o visual compartilhado. Fixtures determinísticas e stories separadas de widget e popup.
- Storybook: instalados `storybook` e `@storybook/react-vite` 10.6.3 via pnpm; configuração Vite independente, Tailwind, Geist, alias e toolbar de tema. `pnpm build-storybook` passou (aviso de tamanho de chunk).
- Validação inicial: 12 testes de CPU/popup/barra passaram. Integração completa e inspeção visual ainda pendentes. Nenhuma validação nativa feita nesta etapa.
- Próximo passo: verificar a referência CPU (incluindo preview inerte e refs), concluir baseline restrito à árvore atual e só então migrar memória e demais features na ordem do checklist.

### 2026-10-22 — Referência CPU e Storybook verificados

- Status: referência CPU concluída no frontend; plano completo em andamento.
- Padrão: `CpuProps` estende os atributos/ref do botão e exige evento do contrato, última leitura (ou undefined), horário, formato e descrição acessível. O visual calcula apenas apresentação. `CpuPopup` exige evento, última leitura, horário e indicação demo. Ambos não usam hooks, contextos ou serviços. `CpuController` e `CpuPopupController` resolvem dependências separadamente em cada janela. O Slot na composição controladora combina as refs/handlers do tooltip e do trigger sem sobrescrevê-los.
- Studio: removido o ramo visual duplicado de CPU em `DemoWidget`; `DemoCpuController` adapta explicitamente os escalares demo para o mesmo visual. O preview estático mantém a fonte de demonstração, sem subscription. Nenhum contrato Rust, bridge ou configuração persistida mudou.
- Testes: `cpu-controlled.test.tsx` cobre loading, sucesso, erro retido/stale, indisponibilidade, formato compacto, ref/callback, intervalo, cleanup e preview sem timer/subscription. As verificações existentes de CPU/popup foram preservadas com props explícitas. Suites dirigidas de popup, studio e preview: 16 testes passaram; suites CPU e configuração nativa: 17 testes passaram.
- Baseline restrito à árvore atual: 53 suites / 344 testes passaram. Após os três novos testes, a primeira execução completa encontrou uma única expectativa de studio (`17%`): ajustada para `17.0%`, o formato do visual nativo compartilhado; as outras 346 verificações passaram. Não foram identificadas falhas preexistentes nas suites desta árvore.
- Storybook: `pnpm build-storybook` passou após configurar `.storybook/vite.config.ts` independente. A configuração também entra em `tsc -b` via `tsconfig.storybook.json`. Avisos do build: diretiva `use client`/sourcemap da primitiva Chart e chunks grandes. Inspeção no navegador confirmou o widget com 25.5%, o popup claro com dois gráficos e o popup escuro com erro IPC e última leitura desatualizada.
- Documentação: comandos e orientação para fixtures/stories em `README.md`; saída ignorada em Git, Prettier e ESLint.
- Limitações: não foi realizada interação com a barra Windows compilada. Tooltip/foco/Escape/posicionamento nativos continuam pendentes no gate final. As stories das demais features também permanecem pendentes, junto com suas migrações.
- Próximo passo: migrar memória (widget, gráfico, popup, preview e stories), repetindo o padrão CPU. Depois seguir GPU, disco, relógio, áudio, komorebi, música, lembretes e agentes na ordem do checklist. Manter os contextos existentes até que seus últimos consumidores sejam migrados.

### 2026-10-22 — Estabilização das verificações

- Status: em andamento.
- Instalar Storybook alterou a resolução automática do peer `react-is` do Recharts de 18.3.1 para 17.0.2. Adicionada a dependência explícita `react-is@18.3.1` por pnpm para preservar a resolução anterior do gráfico; lockfile regenerado pelo gerenciador.
- A rodada completa seguinte passou 346/347 testes, mas `restores the last menu and monitor after reopening without saving the draft` excedeu os 10 segundos. O mesmo teste passou isoladamente sem mudar timeout ou assertions. A rodada ocorreu com builds e servidor de desenvolvimento ativos; isso é uma possível causa de contenção, não uma causa comprovada.
- Próximo passo: repetir build com a resolução final e executar o gate sem builds/servidor do Storybook concorrentes; registrar o resultado final abaixo. Não classificar o timeout como falha preexistente comprovada.

### 2026-10-22 — Fechamento do primeiro marco

- Status: primeiro marco concluído; implementação global parcial.
- Validações finais: `pnpm check` passou integralmente (Prettier, ESLint, TypeScript, 54 suites / 347 testes). `pnpm build-storybook` passou com `react-is@18.3.1`. `pnpm build` também passou; avisos de anotações de dependências e tamanho de chunks, sem falha de build. `git diff --check` passou.
- O teste que havia excedido 10 segundos passou na repetição completa, sem aumento de timeout ou remoção de verificações. O incidente permanece registrado acima.
- Nenhuma alteração em Rust, contratos do bridge ou esquema persistido. Não houve validação da aplicação Windows compilada.
- Próximo passo: começar memória. As migrações de todas as demais features, a eliminação final dos contextos e a validação nativa permanecem desmarcadas. Não considerar o plano completo com esta entrega.

### 2026-10-23 — Migração de memória

- Status: em andamento.
- Separados `MemoryController` e `MemoryPopupController` dos visuais `Memory` e `MemoryPopup`; `MemoryGraph` já recebia histórico e horário por props. Tooltip e trigger permanecem no controlador, com composição de refs via Slot.
- Registro de widgets, PopupCheckBar e definição do popup usam os controladores. DemoWidget adapta os escalares para o mesmo visual; removido o ramo duplicado de memória.
- Adicionados fixtures determinísticos, stories de widget/popup e testes de estados por props, ref/callback, retenção, intervalo, cleanup e preview inerte. Mantidas as verificações existentes do popup.
- Validação inicial: `pnpm typecheck` passou. Checks completos e build do Storybook pendentes.
- Próximo passo: concluir a validação de memória e seguir para GPU. Validação nativa Windows permanece pendente.

### 2026-10-23 — Memória verificada no frontend

- Status: etapa de memória concluída no frontend; implementação global parcial.
- Visuais `Memory`, `MemoryPopup` e `MemoryGraph` recebem suas dependências por props. Controladores próprios resolvem canal, retenção, relógio de freshness, configuração, tooltip e popup por janela. O registro e o preview usam os novos controladores, sem alterar Rust, bridge ou configuração persistida.
- `pnpm check` passou integralmente: Prettier, ESLint, TypeScript e 55 suites / 350 testes. Os oito testes dirigidos de memória também passaram. Preservadas as verificações existentes do popup, incluindo gaps no gráfico, falha parcial de cache e arquivo de paginação não configurado.
- Na primeira rodada dirigida, o teste da barra detectou alteração acidental do rótulo acessível; restaurado `Uso da RAM`. A rodada completa posterior passou. Não foram identificadas falhas preexistentes nesta execução.
- `pnpm build-storybook` e `pnpm build` passaram. Permanecem avisos de tamanho dos chunks, anotações de dependências e diretiva/sourcemap do Chart, sem falhas de build.
- Inspeção no navegador: widget com label e 53.1%; popup claro com gráfico e métricas; popup escuro com cache indisponível e paginação não configurada; popup escuro com erro IPC e última leitura marcada desatualizada. Stories incluem loading, sucesso, indisponibilidade, erro, stale, formato compacto/label, falha parcial e indicação demo.
- Limitação: nenhuma interação com a aplicação Windows compilada foi realizada; tooltip, foco, Escape e geometria nativos permanecem no gate final desmarcado.
- Próximo passo: migrar GPU (widget, popup, preview, stories e testes), preservando as métricas parcialmente indisponíveis. Depois seguir disco e as demais features na ordem do checklist. Manter os contextos até migrar seus últimos consumidores.

### 2026-10-23 — GPU, discos e relógio em paralelo

- Status: em andamento.
- GPU será migrada pelo agente principal; discos e relógio por subagentes, autorizados pelo usuário. Cada agente modifica apenas sua feature e testes específicos. Integração dos registros compartilhados e atualização deste plano ficam com o agente principal.
- Decisão: executar este lote em paralelo após concluir CPU/memória, pois as três features não dependem entre si. Preservar o padrão já verificado; validar em conjunto antes de marcar etapas concluídas.
- Próximo passo: implementar visuais/controladores, integrar previews, executar testes dirigidos e gate completo, build e inspeção das stories. Validação nativa permanece pendente.

### 2026-10-23 — GPU implementada e komorebi delegado

- Status: GPU em validação; discos e relógio em implementação paralela.
- GPU: adicionados `GpuController`, `GpuPopupController`, visuais com props obrigatórias, fixtures e stories; registro e DemoWidget passam a compartilhar o visual. Preservada a independência das métricas Windows/Afterburner e os gaps dos gráficos.
- Validação inicial: sete testes dirigidos de GPU passaram. Acrescentada cobertura do adaptador studio e da subscription própria do popup, ainda a executar.
- Desvio de ordem autorizado: komorebi também delegado a um subagente independente; integração compartilhada e gate final permanecem com o agente principal. Áudio, música, lembretes e agentes ficam para os lotes seguintes.

### 2026-10-23 — Primeiro lote integrado e segundo lote em validação

- Status: implementação frontend em andamento.
- GPU: dez testes dirigidos passaram, incluindo popup com subscription própria, retenção no erro, cleanup do timer de freshness e adaptador studio sem conexão nativa. Asserções de timers do popup verificam o intervalo da feature; timers internos de animação do Recharts pertencem à biblioteca.
- Discos: quatro suites / quatorze testes passaram; visuais/controladores, preview compartilhado, fixtures e stories concluídos. Mantidos filtros de volumes e estados vazio/stale.
- Relógio: cinco testes dirigidos e ESLint passaram; timer de minuto no controlador, calendário readOnly controlado por props, stories com avanço determinístico de dia. Corrigido rollover da seleção do DayPicker à meia-noite via onSelect explícito.
- Komorebi: duas suites / seis testes passaram; refs/animação no controlador, visuais sem consultas de ambiente, títulos demo explícitos e seleção inerte bloqueada. Cancelamento de animação no unmount/offline coberto.
- Áudio: sete suites / trinta e três testes de disco+áudio passaram e ESLint dirigido passou. Volume/microfone, seleção de endpoints, roteamento Voicemeeter e estados pending/erro ficam nos controladores. Corrigidas pendência do slider de saída e porcentagem duplicada.
- Música: trinta verificações comportamentais existentes passaram após extração de controladores, incluindo busca de posição, favoritos, progresso e SpotifySettings. Novas stories/testes diretos em validação.
- Lembretes: trinta e uma verificações existentes passaram após separação de widget, editor Tiptap, formulários, alerta e CalendarSettings; novas stories/testes diretos em validação.
- Agentes: separação de widget, popup, sessões OpenCode, perguntas, permissões e alertas implementada. Vinte e seis verificações existentes passaram preservando conteúdo e proteções de tentativa única; novos testes diretos/stories em validação.
- Integração: registros globais e DemoWidget usam controladores; removidas duplicações visuais migradas. Rede/janela ativa compartilham placeholder explicitamente indisponível.
- Próximo passo: concluir auditoria das props/previews, gate completo e builds; inspecionar stories e registrar limitações nativas. Nenhum contrato Rust/bridge/configuração persistida mudou.

### 2026-10-23 — Auditoria de visuais e infraestrutura de preview

- Status: integração frontend concluída; gate global e validações finais em andamento.
- Duas auditorias independentes revisaram visuais e integração. Não foram encontrados hooks, stores, contextos ou serviços runtime nos visuais migrados. Mês/seleção do calendário, formulários, pending, erros, refs, títulos e ações são fornecidos pelos controladores. Movido também o callback de foco/seleção de duração de lembretes para seu controlador.
- Corrigidos dois gaps compartilhados: `useOverlayPopover` agora ignora previews inertes (inclusive listener Tauri `overlay:closed` e abertura); `useOverlayTooltip` não agenda texto vazio, demo ou preview e esconde uma superfície existente ao desativar sua configuração.
- Testes de preview agora simulam overlay nativa e verificam que foco/hover/clique não fazem listen nem show. Os testes dirigidos de integração (barra, popup, tooltip, configurações e preview) passaram: cinco suites / 67 testes. Após ampliar o teste de desativação de tooltip, nove testes de overlay/isolamento passaram.
- Teste com React Profiler confirma que a leitura de CPU não renderiza memória e vice-versa; unmount limpa ambas subscriptions e timers.
- Agentes: sete testes diretos adicionais passaram, cobrindo refs/callbacks, formulários controlados, pending/erro, decisões explícitas, IDs visíveis de alertas, aba controlada, connect/cleanup e preview inerte. As 26 verificações comportamentais existentes continuaram passando.
- Storybook e aplicação compilaram; avisos de diretivas/sourcemaps e tamanho de chunks continuam sem falha de build. Addons/configurações Storybook foram alterados em paralelo por outra origem durante esta execução; preservados e normalizados apenas na formatação para executar o gate.
- Bloqueio de inspeção: a ferramenta de navegador retornou `Transport closed` tanto ao abrir a story de GPU quanto ao tentar reinicializar a sessão. Não foi possível revisar visualmente todas as stories deste lote nos dois temas; esse gate permanece desmarcado. Nenhuma validação Windows compilada foi feita.
- Próximo passo: concluir `pnpm check`, repetir build Storybook com a configuração final e registrar resultado. Revisão visual de todas stories e validação nativa continuam necessárias antes de concluir o plano global.

### 2026-10-23 — Fechamento da migração frontend

- Status: todas as features migradas no frontend; plano global permanece parcial por validação visual/nativa pendente.
- `pnpm check` passou integralmente: Prettier, ESLint, TypeScript e 64 suites / 397 testes. O teste novo de isolamento entre widgets e o de desativação dinâmica de tooltip também foram incluídos. Nenhuma falha preexistente permaneceu nesta rodada.
- `pnpm build` passou após as últimas alterações, com avisos de anotações de dependências e chunks grandes. `git diff --check` passou.
- `pnpm build-storybook` passou com a configuração final: 31 arquivos de stories, 155 cenários publicados no índice. Não equivale a revisão visual; essa checkbox permanece desmarcada porque a ferramenta de navegador perdeu a conexão. Avisos: diretivas/sourcemaps de UI/dependências e chunks grandes.
- Registros: todos os 11 widgets funcionais usam controladores; os dois placeholders compartilham o visual explícito. Todos os 11 registros de popup resolvem seus controladores por janela. Settings de Spotify/Calendar usam controladores. Mantidos WidgetViewContext e WidgetPreviewContext como dependências dos controladores, sem consumidores nos visuais; as duplicações antigas do DemoWidget foram removidas.
- Registros de validação dirigida e decisões estão nas entradas anteriores. Falhas intermediárias desta execução foram corrigidas: formatação de arquivos alterados em paralelo, regras de hooks nos pais de stories e inferência estreita dos slots ReactNode no fixture de lembretes. As verificações comportamentais existentes foram preservadas.
- Nenhum arquivo Rust, contrato do bridge, schema persistido ou evidência histórica foi alterado.
- Próximo passo: revisar os 155 cenários nos temas claro/escuro (incluindo interações) quando a conexão do navegador for restabelecida; compilar/abrir a aplicação Windows e verificar tooltip, popup, foco, Escape, áudio, ações e posicionamento da overlay. Somente depois marcar os dois últimos gates e considerar o plano concluído.

### 2026-10-23 — Documentação de Widget e WidgetPopup no Storybook

- Status: concluída a documentação de composição; gates visuais/nativos anteriores permanecem pendentes.
- Adicionados `src/components/status-bar/widget.stories.tsx` e `src/popups/widget-popup.stories.tsx`, com páginas Autodocs em Composição/Widget e Composição/WidgetPopup. A descoberta do Storybook agora inclui components e popups além das features.
- Documentados configuração, responsabilidades do host/controladores/visuais, previews inertes, API Root/Trigger/Anchor, parâmetros tipados e diferenças browser/Windows. Exemplos incluem galeria dos 13 widgets, compact/label, roteamento de áudio, âncora completa, trigger desativado e popup único ativo. Adicionada função play de abertura/Escape/foco; sua execução em navegador não foi verificada nesta sessão.
- Validação: TypeScript, ESLint dirigido, Prettier e `git diff --check` passaram; `pnpm build-storybook` passou e o índice gerado contém ambas páginas docs e suas 11 stories. Sem alterações de comportamento nos componentes documentados.

### 2026-10-23 — Guia de utilização em MDX

- Status: guia concluído e compilado.
- Criado `src/stories/widget-and-popup.mdx`, página Guias/Usando Widget e WidgetPopup, seguindo os blocos Meta/Canvas da documentação oficial do Storybook 10.6. Descoberta MDX adicionada à configuração existente.
- Guia passo a passo com configuração, filtragem/ordem de instâncias, composição Root/Trigger/asChild/Anchor, parâmetros, tooltip/refs, preview inerte e solução de erros comuns. Reutiliza seis canvases das stories existentes, sem duplicar implementações.
- Validação: `pnpm build-storybook`, `pnpm typecheck`, Prettier e `git diff --check` passaram. Entrada MDX confirmada no índice gerado. Revisão visual e gates nativos anteriores permanecem pendentes.

### 2026-10-23 — Autodocs em todas as stories

- Adicionada a tag `autodocs` nos 31 arquivos de stories restantes; os 33 arquivos CSF agora possuem a tag, preservando as stories existentes e o guia MDX.
- Validação: Prettier e `git diff --check` passaram; `pnpm build-storybook` passou. Índice estático confirmou 33 páginas Autodocs e uma página MDX. O servidor de desenvolvimento não foi verificado nesta etapa.

### 2026-10-23 — Tutorial de inclusão de popups

- Expandido o MDX com oito etapas: estrutura da feature, visual, controlador/contexto, definição `details.popup.ts`, schema/default export/lazyContent, geração de registro/tipos, trigger, story e validação Windows.
- Documentadas descoberta recursiva, regras/duplicidade de IDs, arquivos gerados, configuração independente do Storybook e necessidade de recompilar o host para atualizar os IDs nativos permitidos.
- Validação: build Storybook, Prettier e `git diff --check` passaram. O módulo MDX servido na porta 6006 respondeu HTTP 200 contendo a nova seção `details.popup.ts`; isso verifica entrega/compilação, não inspeção visual da página.

### 2026-10-23 — Correção das tabelas no MDX

- Reprodução via módulo MDX servido na porta 6006: tabelas pipe chegavam como texto e nenhum elemento table era gerado. Convertidas as três tabelas do guia para JSX com thead/tbody/th/td e code inline, sem dependência adicional.
- Verificação após correção: três elementos table compilados, nenhuma tabela pipe bruta no módulo servido. Build Storybook, Prettier e `git diff --check` passaram; não foi realizada inspeção visual via navegador.

### 2026-10-23 — Paleta Strata no Storybook

- Aplicadas variantes claro/escuro da paleta de `src/app/styles.css` à interface manager e à documentação MDX/Autodocs. `.storybook/theme.ts` contém os equivalentes sRGB dos tokens OKLCH, com rosa/lilás, superfícies, textos, bordas, inputs e fonte Geist.
- `.storybook/manager.ts` aplica a marca Strata e acompanha o global theme da toolbar. `docs-container.tsx` usa a mesma paleta e acompanha GLOBALS_UPDATED, inclusive em MDX sem meta CSF anexada, preservando tema já selecionado e removendo listener ao desmontar.
- Validação: três testes de tema/sincronização passaram, TypeScript, ESLint dirigido, Prettier e `git diff --check` passaram. Build Storybook passou. Servidor da porta 6006 reiniciado para descobrir manager.ts; HTTP via loopback confirmou bundle manager com paleta e Geist, e módulo de tema servido ao preview. Não foi feita inspeção visual via navegador.

## Decisões adotadas

- Abrangência: **todos os widgets, previews e popups**.
- Organização: **um pai controlador por widget ou popup**, próximo à respectiva
  feature.
- Os visuais recebem também o estado de UI; não mantêm estado próprio.
- A mudança preserva aparência, funcionalidades e contratos nativos existentes.

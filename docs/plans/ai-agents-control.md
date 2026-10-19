# Controle de agentes de IA — Windows 11

## Execução

Trabalhar em uma subtask por vez. Marcar cada item somente após implementação e
validação; reportar o progresso ao concluir cada subtask.

Plano criado antes de alterações no código. Subtask 1 iniciada pelo levantamento
da arquitetura existente. A entrevista de design solicitada com `grill-me` está
em andamento; contratos e integrações dependem das decisões registradas abaixo.

## Escopo solicitado

- Windows 11 como ambiente de detecção, monitoramento e notificações.
- Agentes: ChatGPT Desktop, OpenCode e Antigravity (Codex não incluído).
- Sessões agrupadas por ferramenta, com status individual em tempo real.
- Atenção para perguntas, confirmações e solicitações de ferramentas.
- Iniciar sessões e responder pelo popup.
- Notificar conclusão bem-sucedida de tarefas.
- Reutilizar o Design System e a infraestrutura nativa do Strata.

## Subtask 1: Arquitetura, tipos e comunicação com processos/APIs

- [ ] Definir os tipos TypeScript `AgentType`, `AgentSession`, `SessionStatus` e
      `AgentMessage`, derivados de um contrato único.
- [ ] Implementar a camada de integração/polling para detectar instâncias/sessões
      ativas do ChatGPT, OpenCode e Antigravity no Windows 11.
- [x] Criar o store/gerenciador de estado global dos agentes (descoberta de
      aplicativos; sessões serão adicionadas com os conectores).

Etapas de arquitetura e validação:

- [x] Identificar as superfícies de cada produto incluídas no escopo.
- [ ] Verificar fontes reais de sessões, status e perguntas por ferramenta.
- [ ] Definir capacidades de detecção, criação e resposta por integração.
- [ ] Definir identidade de sessão, transições, desconexão e reconexão.
- [x] Definir limites de leitura e retenção de mensagens locais.
- [ ] Confirmar o entendimento compartilhado após a entrevista de design.
- [ ] Implementar e validar contratos, integração nativa e ciclo de vida do store.

## Subtask 2: UI do popup — lista e separação por agente

- [ ] Criar o layout do popup seguindo o Design System do projeto.
- [ ] Implementar abas/seções separando sessões ativas do ChatGPT, OpenCode e
      Antigravity.
- [ ] Exibir indicadores visuais em tempo real: processando, aguardando resposta,
      concluído e erro.

## Subtask 3: Ações de interação — nova sessão e responder

- [ ] Implementar o fluxo para iniciar nova sessão de agente a partir do popup.
- [ ] Implementar input de resposta rápida no card da sessão afetada, sem
      alternar de janela.

## Subtask 4: Notificações — atenção exigida e conclusão

- [ ] Implementar disparo de notificações para perguntas/prompts que exigem atenção.
- [ ] Implementar disparo de notificações para tarefas concluídas.
- [ ] Integrar notificações nativas do Windows 11 se aplicável/suportado.

## Decisões confirmadas — rodada 1

1. Escopo de ChatGPT: ChatGPT Desktop.
2. Cobertura: descobrir também sessões abertas fora do Strata.
3. Integrações parciais: apresentar capacidades indisponíveis explicitamente quando
   uma ferramenta não oferecer um caminho de integração comprovado.

## Levantamento inicial da arquitetura

- Não há integração existente com os três agentes no repositório.
- Reutilizar o framework de popups interativos existente, sem nova janela.
- Usar o serviço de lembretes como referência para monitoramento independente do
  popup, snapshots versionados, adapter nativo/demo e store Zustand.
- Derivar os tipos TypeScript de contratos Rust via `ts-rs`, como no projeto atual.
- Fontes candidatas a validar por versão instalada: servidor HTTP/eventos do
  OpenCode e hooks do Antigravity. Não há fonte de sessões do ChatGPT Desktop
  comprovada neste levantamento.

## Decisões confirmadas — rodada 2

1. Permitir uma etapa de configuração de conectores locais e hooks necessários,
   mostrando as capacidades habilitadas por conexão.
2. Coletar somente metadados e perguntas pendentes necessários ao popup; manter
   esses dados apenas em memória, sem persistir histórico no Strata.
3. Conclusão significa fim bem-sucedido de uma execução/turno por evento explícito,
   mantendo a conversa disponível para novos pedidos.

## Decisões confirmadas — rodada 3

1. Perguntas textuais e aprovações de ferramentas devem ter controles distintos;
   nenhuma aprovação automática.
2. Perda de conexão deve produzir estado desconhecido/desconectado e desabilitar
   respostas até reconciliar o estado da sessão.
3. Notificações devem funcionar com o popup fechado, deduplicar eventos e evitar
   anunciar eventos antigos como novos ao iniciar o Strata.
4. Novas sessões devem solicitar os parâmetros exigidos pela integração (por
   exemplo, projeto e prompt), sem executar comandos arbitrários.
5. Preferir APIs/eventos/hooks; automação de interface e protocolos privados ficam
   fora desta primeira implementação.

Todas as cinco decisões foram aceitas pelo usuário. Não reenviar respostas
automaticamente após desconexão. Solicitar projeto/pasta e prompt inicial conforme
as exigências da integração.

## Desenho consolidado para confirmação final

- Serviço Rust compartilhado acompanha integrações mesmo com popup fechado.
- Cada ferramenta expõe capacidades independentes: detectar aplicativo, listar
  sessões, receber status/perguntas, criar sessão, responder e aprovar/recusar.
- Detectar aplicativo aberto não implica capacidade de listar suas conversas.
  Sessões externas são incluídas quando a integração permitir descobri-las.
- Identidade de sessão usa ferramenta, conexão e identificador do provedor;
  perguntas e execuções preservam seus identificadores para evitar duplicação.
- Contrato distingue processamento, atenção, conclusão, erro, estado desconhecido
  e desconexão; indisponibilidade de integração é independente do status da sessão.
- Snapshot inicial estabelece a linha de base sem notificações retroativas;
  reconexão reconcilia o estado sem reaplicar ações já enviadas.
- Perguntas textuais e pedidos de aprovação têm ações distintas. Respostas são
  vinculadas ao pedido pendente e validadas nativamente antes do envio.
- Conteúdo necessário ao popup permanece em memória. O Strata não persiste o
  histórico de conversas.
- API/eventos locais do OpenCode e hooks do Antigravity são candidatos a validar;
  não prometer controle das sessões do ChatGPT Desktop sem fonte comprovada.
- Tipos gerados de Rust via `ts-rs`, adapter nativo/demo separado e store Zustand
  com proteção contra snapshots antigos seguem os padrões existentes.
- Subtask 1 entrega contratos, detecção/conectores comprovados e estado global;
  layout, ações e notificações ficam nas respectivas subtasks seguintes.

## Execução autorizada — ticket 1

Após a síntese da spec e a proposta de tickets verticais, o usuário acionou
`implement` e pediu para prosseguir com o primeiro ticket. Pontos de teste:
contrato público do serviço e comportamento visível do popup, com validação real
no Windows. Referência da revisão: commit `9e3bb9d`; commit na branch atual.

- [x] Contrato Rust de descoberta com tipos TypeScript gerados.
- [x] Enumeração Win32 de nomes de executáveis, compartilhada entre monitores,
      a cada três segundos e independente da visibilidade do popup.
- [x] Store com snapshots versionados, proteção contra respostas atrasadas e
      liberação de listeners mesmo ao fechar durante a conexão.
- [x] Widget nativo e preview com popup separado por ferramenta, estado de
      detecção e controles indisponíveis explícitos; demo identificado.
- [x] Probe nativo de descoberta sem abrir barras ou ler conversas.
- [x] Revisão final do ticket e commit.

Este ticket entrega descoberta de aplicativos, não descoberta de sessões. A
Subtask 1 original permanece parcial: AgentSession, SessionStatus e AgentMessage
serão definidos com o contrato de sessões comprovado pelo primeiro conector.
Subtasks 2–4 também não estão concluídas pelo popup inicial.

## Validação do ticket 1

Ajuste solicitado após a primeira entrega: popup único com accordion por
ferramenta, inicialmente recolhido e com uma seção aberta por vez. O estado de
detecção permanece visível no cabeçalho; detalhes e ações ficam na expansão.

- Testes focados: 9 frontend; 3 nativos novos.
- Testes Rust: 126 passaram e 9 foram ignorados.
- TypeScript, build frontend, build Rust e lint dos arquivos alterados passaram.
- Probe Win32 real: ChatGPT e OpenCode detectados; Antigravity não detectado,
  consistente com a listagem independente de processos do Windows.
- A suíte frontend completa encontrou uma falha no teste de posição dos controles
  de áudio; reproduzida também com NativeBar do commit inicial `9e3bb9d`.
- Última execução completa: 227 passaram e 2 falharam. Além da falha acima,
  houve uma falha intermitente no preview do microfone; a suíte isolada de
  microfone passou com seus 7 testes, sem alterações.
- O gate agregado está limitado por formatação em cinco arquivos preexistentes e
  quatro erros de classes Tailwind no componente code-block, fora desta entrega.
- A interação do novo popup no WebView2 real ainda não foi exercitada; não
  interrompemos a instância de Strata já aberta para substituí-la pelo novo build.
- Revisão de padrões: corrigida a falha na qual o erro da leitura inicial
  encerrava uma assinatura de eventos válida; teste de regressão passou e a
  segunda revisão não encontrou pendências. Revisão de escopo: sem desvios do
  ticket 1, com a limitação de validação WebView2 registrada acima.

## Ticket 2 — OpenCode: conexão e sessões existentes

Escopo autorizado: conectar o OpenCode local, listar sessões existentes no
accordion único, exibir estados comprovados e reconciliar após falhas. Criar
sessões, responder e aprovar ferramentas continuam nos tickets seguintes.

Levantamento: a versão instalada é OpenCode 2.0.32. Seu contrato OpenAPI público
usa `/api/session` e `/api/session/active`; os exemplos v1 da documentação geral
não correspondem a essa versão. Usar o comando público `opencode api GET`, com
rotas fixas, para aproveitar a autenticação já gerenciada pelo cliente local.
Não ler arquivos de credenciais, histórico ou mensagens completas.

- [x] Gerar contrato de sessões e conexão a partir de Rust.
- [x] Implementar coletor de metadados v2 e validar identidade/estado/limites.
- [x] Integrar conexão explícita, monitoramento em segundo plano e desconexão,
      impedindo resultados antigos após desconectar/reconectar.
- [x] Exibir sessões recentes e execuções ativas no accordion do OpenCode.
- [ ] Validar pelos contratos públicos e pelo popup, verificar a API real no
      Windows, executar os gates apropriados, revisar e fazer commit.

Referência da revisão deste ticket: `a952a316de5c0c0206774f4ca38d9a9cbdb5b2a9`.

Comportamento entregue:

- Conexão habilitada explicitamente; configuração e sessões apenas em memória.
- Resolver somente o CLI v2 instalado pelo OpenCode Desktop. Nenhum caminho,
  comando, endpoint ou argumento arbitrário é recebido da UI.
- Consultar metadados a cada cinco segundos após a consulta anterior, mesmo com
  o popup fechado. O monitor de processos continua independente a cada três
  segundos. Cada consulta tem limite total de vinte segundos e pode ser cancelada.
- Até cinquenta sessões recentes, incluindo execuções ativas fora dessa página;
  histórico adicional sinalizado. Sessões arquivadas inativas não são exibidas.
- Execuções ativas verificam formulários e aprovações pendentes; nenhuma resposta
  ou aprovação é enviada. Inatividade não significa sucesso: conclusão e erro
  dependem de `outcome` explícito da API, rotulados como resultado do último turno.
- Falhas marcam sessões como desconectadas; reconexão substitui o snapshot.
  Desconectar limpa metadados e invalida consultas em andamento.
- Snapshot versão 2: falhas de enumeração Win32 não invalidam a conexão de sessões.
  Reiniciar o host nativo é necessário para carregar o novo contrato e comando.

Validação inicial:

- Doze testes frontend focados passaram. Cinco testes novos Rust passaram; um
  teste explícito da API real passou consultando metadados em memória e emitindo
  somente contagens para a evidência.
- Suíte Rust completa: 131 passaram e 10 ignorados, incluindo o teste live que foi
  executado separadamente.
- Build frontend, TypeScript e lint dos arquivos alterados passaram.
- Suíte frontend: permanece a falha preexistente da posição dos controles de
  áudio. Gate agregado permanece limitado pela formatação preexistente.
- O caminho live validou OpenCode Desktop 2.0.32 neste Windows. CLI instalado
  isoladamente, v1 e servidores remotos não estão cobertos por este conector.
- A interação no novo popup em WebView2 ainda requer validação na instância com o
  host atualizado; a consulta nativa real não substitui esse teste visual.

Não inferir processamento, atenção ou sucesso apenas pela presença de processo.
Preservar validação nativa, CSP, escopo de capabilities e ausência de fallback
demo em falhas nativas.

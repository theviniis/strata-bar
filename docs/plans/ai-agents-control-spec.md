# Controle de agentes de IA no Windows 11

## Problem Statement

## Solution

Adicionar um widget com popup que agrupa sessões por ferramenta, mostra estados
reais e oferece ações conforme as capacidades comprovadas de cada integração.
Monitorar também sessões abertas fora do Strata quando a ferramenta permitir.
Notificar atenção e conclusão mesmo com o popup fechado, mantendo explícitas as
limitações das integrações.

## User Stories

1. Como usuário do Windows 11, quero abrir o controle de agentes pela barra para
   acompanhar meu trabalho em um único lugar.
2. Como usuário, quero sessões agrupadas por ferramenta para identificar sua origem.
3. Como usuário do OpenCode, quero acompanhar sessões conectadas para ver seu estado.
4. Como usuário, quero descobrir sessões abertas fora do Strata para manter minha
   rotina atual de trabalho.
5. Como usuário, quero distinguir aplicativo aberto de sessão detectada para não
   interpretar presença de processo como atividade de uma conversa.
6. Como usuário, quero ver quais integrações estão conectadas para entender a cobertura.
7. Como usuário, quero configurar conectores locais e hooks para habilitar capacidades.
8. Como usuário, quero identificar capacidades indisponíveis para entender limitações.
9. Como usuário, quero ver sessões processando para acompanhar execuções em andamento.
10. Como usuário, quero ver perguntas pendentes para saber onde preciso responder.
11. Como usuário, quero distinguir erro de conclusão para decidir o próximo passo.
12. Como usuário, quero ver estado desconhecido ou desconectado para não confiar em
    informações que deixaram de ser atuais.
13. Como usuário, quero iniciar uma sessão pelo popup quando suportado para começar
    trabalho sem procurar outra janela.
14. Como usuário, quero informar projeto/pasta e prompt conforme a ferramenta exigir
    para iniciar a sessão no contexto correto.
15. Como usuário, quero responder perguntas textuais no card da sessão para continuar
    o trabalho sem alternar de janela.
16. Como usuário, quero ver a operação solicitada antes de aprovar uma ferramenta
    para decidir conscientemente sobre sua execução.
17. Como usuário, quero controles distintos de aprovar e recusar para não confundir
    permissões com respostas textuais.
18. Como usuário, quero respostas vinculadas à pergunta correta para evitar enviar
    conteúdo a outra sessão ou a um pedido que já foi resolvido.
19. Como usuário, quero respostas bloqueadas durante desconexão para evitar envios
    com estado desatualizado.
20. Como usuário, quero reconciliar sessões ao reconectar sem reenvio automático
    para evitar ações duplicadas.
21. Como usuário, quero alertas de atenção com o popup fechado para não perder perguntas.
22. Como usuário, quero alertas de conclusão bem-sucedida de um turno para saber
    quando posso revisar o resultado, mesmo com a conversa ainda aberta.
23. Como usuário, quero cada evento notificado uma única vez para evitar alertas repetidos.
24. Como usuário, quero iniciar o Strata sem alertas retroativos para não confundir
    eventos antigos com novidades.
25. Como usuário, quero que uma falha de integração preserve as outras ferramentas
    para continuar acompanhando as sessões disponíveis.
26. Como usuário, quero que o Strata mantenha apenas metadados e perguntas necessários
    em memória para não criar outra cópia persistente do histórico de conversas.
27. Como usuário com vários monitores, quero uma visão coerente das sessões para
    acompanhar o mesmo trabalho por qualquer barra.
28. Como usuário de teclado, quero reutilizar foco e fechamento do popup existente
    para operar inputs e ações de forma previsível.
29. Como usuário do studio, quero dados demonstrativos identificados para distingui-los
    das sessões reais do Windows.

## Implementation Decisions

- Reutilizar o framework de WidgetPopup, seu host compartilhado, foco, geometria
  e ciclo de vida; a feature fornece conteúdo, dados e ações.
- Codex local usa hooks oficiais, somente metadados, ativação explícita e revisão
  de confiança no próprio Codex. Não editar trust hashes ou políticas. Hooks
  desconhecidos são preservados; desativar remove apenas definições idênticas
  desta instalação. O comando é estável entre reinícios e lê um endpoint local
  efêmero. Nenhuma decisão de ferramenta é enviada; stdout neutro é {}.
- Sem eventos recentes, processamento/atenção Codex tornam-se desconhecidos.
  Stop/Interrupt indicam inatividade sem comprovar sucesso. Não emitir alerta de
  conclusão por esses hooks. Criar/responder e notificações Codex ficam para uma
  etapa posterior; esta fatia oferece monitoramento após hooks carregados e
  confiados, sem enumeração de conversas anteriores.
- Configuração Codex: respeitar CODEX_HOME quando definido; caso contrário,
  USERPROFILE/.codex/hooks.json. Endpoint efêmero em
  LOCALAPPDATA/Strata/codex-hook-endpoint.json. STRATA_TEST_CODEX_HELPER é somente
  para o ensaio nativo ignorado e aponta ao executável Windows compilado.
- Usar um serviço Rust compartilhado, independente da visibilidade do popup,
  seguindo o padrão dos lembretes para snapshots versionados e eventos.
- Derivar AgentType, AgentSession, SessionStatus e AgentMessage de contratos Rust
  via geração TypeScript, sem duplicar manualmente os modelos.
- Usar adapter nativo separado do demo e store Zustand com validação dos payloads,
  inicialização sem perda de eventos e rejeição de snapshots antigos.
- Separar capacidades de detectar aplicativo, listar sessões, observar estados e
  perguntas, criar sessão, responder e aprovar/recusar. Uma capacidade não implica outra.
- Presença de processo não comprova sessão, processamento, pergunta ou conclusão.
- O primeiro conector usa a API v2 publicada pelo OpenCode Desktop instalado,
  acessada pelo comando público do cliente com leituras fixas. A conexão é
  explícita e usa a autenticação já administrada pelo OpenCode, sem copiar
  credenciais para o Strata. Versões e instalações não verificadas ficam
  explicitamente indisponíveis.
- Listar até cinquenta sessões recentes e incluir execuções ativas fora da página,
  sinalizando histórico adicional. Exibir resultados explícitos do último turno;
  consultar pendências das execuções ativas sem enviar ações.
- Incluir sessões externas somente quando descobertas por uma integração comprovada;
  mostrar limitações quando apenas a presença do aplicativo puder ser detectada.
- Permitir configuração de conectores locais e hooks necessários, explicando as
  capacidades habilitadas. Contratos exatos dependem da validação das versões reais.
- Identificar sessões por ferramenta, conexão e identificador do provedor. Preservar
  identificadores de perguntas e execuções para correlação e deduplicação.
- Distinguir processamento, atenção, conclusão, erro, desconhecido e desconexão.
  Disponibilidade da integração é independente do estado de uma sessão.
- Atenção vem de evento explícito de pergunta ou aprovação. Conclusão significa
  fim bem-sucedido de execução/turno por evento explícito; inatividade não é sucesso.
- Separar resposta textual de aprovação/recusa. Exibir a operação solicitada e
  exigir decisão explícita para cada aprovação, sem aprovações automáticas.
- Validar nativamente ações, capacidades, sessão e pedido pendente. Novas sessões
  recebem projeto/pasta e prompt conforme a integração, sem comandos arbitrários.
- A criação do OpenCode recebe pasta e prompt inicial opcionais. Sem pasta,
  omitir location no pedido para usar o local padrão administrado pelo OpenCode.
  Se informada, a pasta deve ser local, absoluta e existente, validada nativamente.
  Sem prompt, cria uma conversa vazia; com prompt, envia texto com resume:true
  somente para a conversa recém-criada. Validar o texto antes de criar (até
  4096 bytes UTF-8, sem controles exceto quebra de linha e tabulação). Admissão
  do prompt não significa conclusão do trabalho. Resultado tipado preserva o ID
  da conversa e distingue sem prompt, aceito, não enviado e envio incerto.
  Não repetir criação ou envio após falha ou reconexão. Falha parcial fecha o
  formulário e informa a conversa existente para conferência no OpenCode.
- Perguntas do OpenCode vêm apenas dos formulários pendentes das execuções
  ativas. O popup suporta até oito campos textuais simples por formulário,
  respeitando obrigatoriedade e limites de caracteres, 4096 bytes UTF-8 por
  resposta e 8192 bytes por conjunto. Opções, condições, formatos, padrões e
  campos ocultos exigem resposta no OpenCode, sem controles genéricos substitutos.
- Cada resposta identifica sessão, formulário e hash do conteúdo/campos. Antes
  de enviar, reler a lista pública de pendências e recusar pergunta resolvida ou
  alterada. Validar campos e destinatário nativamente e serializar ações entre
  barras. Registrar somente IDs das tentativas em memória (até 1024), sem guardar
  respostas, e bloquear nova tentativa dessa pergunta após envio mesmo incerto,
  inclusive após reconexão. Aprovações de ferramentas permanecem separadas.
- Permissões do OpenCode exibem ação, recursos e todo o contexto público da
  solicitação (metadata, source, message e save), sem ler histórico. Oferecer
  somente aprovar uma vez e recusar, por controles distintos; nunca aceitar
  decisões permanentes. Reconsultar pendências e comparar hash integral antes
  do envio. Contexto desconhecido ou acima dos limites bloqueia ambas as ações,
  sem truncar silenciosamente uma operação aprovável. Tentativas compartilham
  o registro limitado de 1024 ações em memória e sobrevivem a reconexões.
- Ao desconectar, desabilitar respostas e reconciliar estado antes de reabilitá-las;
  não reenviar ações automaticamente.
- Estabelecer linha de base inicial sem notificações retroativas. Deduplicar eventos
  de atenção e conclusão entre atualizações e consumidores.
- Notificar com o popup fechado. Integrar notificações nativas do Windows 11 quando
  suportadas. O alerta no popup faz parte do escopo; submissão e apresentação
  nativas exigem validação distinta no ambiente instalado.
- A segunda entrega usa a API WinRT de toast com a identidade dev.strata.bar
  registrada pelo atalho do instalador NSIS no menu Iniciar. Sem esse registro,
  informar instalação necessária; não registrar identidade de outro aplicativo.
  Um worker compartilhado recebe somente eventos novos, com fila de até 32 itens
  e tentativa única, sem replay após falha ou reconexão. Descartes por capacidade
  ficam explícitos. O popup informa disponibilidade, bloqueio do Windows ou erro.
  Toasts silenciosos mostram somente ferramenta e tipo; títulos e conteúdos das
  sessões não saem para a central de notificações. Não oferecer ações, respostas
  ou aprovações no toast. Preferências do sistema podem impedir apresentação;
  submissão bem-sucedida não comprova que o usuário viu um banner.
- A primeira entrega de alertas usa fila visual nativa compartilhada, contador
  na barra e lista no popup; não toca som nem abre janelas. Notificações nativas
  do Windows permanecem separadas. A linha de base inicial de cada conexão não
  anuncia pendências ou conclusões antigas, inclusive após reconexão.
- No OpenCode, correlacionar sucesso com a marca time.idle da API, exigindo que
  ela seja posterior à atividade observada. Outcome antigo sem nova marca não
  confirma término do turno em execução. Não emitir conclusão se a marca faltar.
- Manter até 32 alertas visuais recentes e indicar quantos anteriores saíram da
  lista. Guardar até 4096 chaves de deduplicação em memória; ao atingir o limite,
  pausar novos alertas sem expulsar chaves antigas para abrir espaço. Dispensar
  somente IDs exibidos, preservar eventos concorrentes e manter deduplicação
  após dispensa.
- Coletar somente metadados e conteúdo de perguntas pendentes necessários ao popup,
  mantidos em memória; não persistir histórico pelo Strata.
- Transportar somente identificador, primeiro workspace e sinais de ciclo de
  execução por receptor local autenticado por conexão. Não ler transcriptPath,
  argumentos de ferramentas, mensagens, artefatos ou arquivos de credenciais.
- Delegar permissões ao comportamento padrão, sem autoaprovar ou forçar
  continuação. Atenção é observável apenas para chamadas explícitas de pergunta
  ou permissão; outras aprovações não são inferidas. Sem eventos novos por dois
  minutos, processamento/atenção passam a desconhecido.
- Preservar CSP, autorização por janela, validação nativa, estilo de janelas
  flutuantes e ausência de fallback demo em falhas nativas.

## Testing Decisions

- Usar o contrato público do serviço de agentes
  como seam principal, observando snapshots, eventos e resultados das ações; testar
  o popup pelo comportamento visível e validar provedores reais no Windows 11.
- Testar comportamento externo, sem depender da organização interna de componentes,
  implementação do polling ou estrutura interna do store.
- Reutilizar os testes de serviço e UI dos lembretes como referência para snapshots,
  inicialização, atualização, ações e funcionamento independente do popup.
- Verificar descoberta de sessões externas, isolamento entre ferramentas, capacidades
  parciais, aplicativo aberto sem sessão comprovada e fontes indisponíveis.
- Verificar perguntas textuais, aprovar/recusar, pedido já resolvido, destinatário
  incorreto, inputs inválidos e bloqueio de ações indisponíveis.
- Verificar snapshots atrasados, eventos repetidos, desconexão, reconexão e ausência
  de reenvio automático de ações.
- Verificar alertas com popup fechado, conclusão somente por sucesso explícito,
  deduplicação e ausência de notificações retroativas na inicialização.
- Reutilizar as verificações do host de popup para foco, inputs, fechamento,
  posicionamento e exclusão de gerenciamento pelo komorebi.
- Executar checks frontend, build e testes Rust apropriados às alterações. Validar
  detecção e integrações no Windows real; mocks não substituem essa evidência.
- Registrar capacidades efetivamente verificadas e cenários não exercitados,
  inclusive suporte a notificações nativas e limitações por versão de ferramenta.

## Out of Scope

- Agentes adicionais além dos quatro confirmados e chats apenas no navegador.
- Automação de cliques, injeção de teclado e protocolos privados.
- Prometer controle de sessões sem fonte de integração comprovada.
- Aprovações automáticas, execução arbitrária de shell e reenvio automático de ações.
- Persistência de histórico de conversas e coleta integral de mensagens.
- Criar outra infraestrutura de janelas ou tratar o studio como prova do MVP nativo.

## Further Notes

As respostas das três rodadas foram confirmadas pelo usuário. Após a síntese e a
proposta de tickets verticais, o usuário acionou implement e pediu para prosseguir
com o primeiro ticket, usando os pontos de teste propostos. Essa autorização não
representa validação antecipada das integrações de sessões.

Executar uma subtask por vez: arquitetura/contratos/integração/store; popup; ações;
notificações. Marcar os itens e reportar ao concluir cada subtask. O plano de
execução existente continua sendo o acompanhamento das entregas.

Publicação pendente: não foi encontrada configuração do issue tracker e do
vocabulário de triagem. Executar `/setup-matt-pocock-skills`; depois de configurar
o destino e confirmar o seam de testes proposto, publicar com `ready-for-agent`.

## Contrato atual — STR-6 e STR-7

O widget está habilitado no catálogo e no layout inicial. Codex e OpenCode
continuam independentes e são os únicos provedores do contrato.

O contrato de snapshots é versão 10, definido em Rust e exportado pelo build
para TypeScript. A configuração mantém versão 2 e ignora preferências antigas
dos provedores removidos, preservando as preferências dos provedores restantes.

A barra conta somente sessões atuais em `attention` de fontes conectadas e
visíveis. Alertas históricos de conclusão e a pausa da fila não tornam o widget
destrutivo. Zero sessões em atenção restaura a apresentação normal.

O popup `agentsAlert` usa o overlay compartilhado e a política de foco,
fullscreen e fechamento explícito dos alertas de lembretes. O backend agenda
a abertura apenas quando o widget está configurado na barra principal e há
atenção nova; a resolução da atenção fecha o popup sincronizado. O browser
continua restrito ao adapter demo. Evidências anteriores permanecem imutáveis
em `docs/evidence/`; validação nova deve registrar suas próprias limitações.

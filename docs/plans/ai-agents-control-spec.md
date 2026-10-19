# Controle de agentes de IA no Windows 11

## Problem Statement

O usuário precisa acompanhar sessões do ChatGPT Desktop, OpenCode e Antigravity
em janelas diferentes. Perguntas, pedidos de aprovação e conclusões podem passar
despercebidos. Falta uma visão central na barra para acompanhar e, quando houver
integração disponível, iniciar sessões e responder sem alternar de janela.

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
3. Como usuário do ChatGPT Desktop, quero detectar o aplicativo aberto para saber
   que ele está disponível, mesmo quando não houver acesso às conversas.
4. Como usuário do OpenCode, quero acompanhar sessões conectadas para ver seu estado.
5. Como usuário do Antigravity, quero acompanhar sessões integradas para ver seu estado.
6. Como usuário, quero descobrir sessões abertas fora do Strata para manter minha
   rotina atual de trabalho.
7. Como usuário, quero distinguir aplicativo aberto de sessão detectada para não
   interpretar presença de processo como atividade de uma conversa.
8. Como usuário, quero ver quais integrações estão conectadas para entender a cobertura.
9. Como usuário, quero configurar conectores locais e hooks para habilitar capacidades.
10. Como usuário, quero identificar capacidades indisponíveis para entender limitações.
11. Como usuário, quero ver sessões processando para acompanhar execuções em andamento.
12. Como usuário, quero ver perguntas pendentes para saber onde preciso responder.
13. Como usuário, quero distinguir erro de conclusão para decidir o próximo passo.
14. Como usuário, quero ver estado desconhecido ou desconectado para não confiar em
    informações que deixaram de ser atuais.
15. Como usuário, quero iniciar uma sessão pelo popup quando suportado para começar
    trabalho sem procurar outra janela.
16. Como usuário, quero informar projeto/pasta e prompt conforme a ferramenta exigir
    para iniciar a sessão no contexto correto.
17. Como usuário, quero responder perguntas textuais no card da sessão para continuar
    o trabalho sem alternar de janela.
18. Como usuário, quero ver a operação solicitada antes de aprovar uma ferramenta
    para decidir conscientemente sobre sua execução.
19. Como usuário, quero controles distintos de aprovar e recusar para não confundir
    permissões com respostas textuais.
20. Como usuário, quero respostas vinculadas à pergunta correta para evitar enviar
    conteúdo a outra sessão ou a um pedido que já foi resolvido.
21. Como usuário, quero respostas bloqueadas durante desconexão para evitar envios
    com estado desatualizado.
22. Como usuário, quero reconciliar sessões ao reconectar sem reenvio automático
    para evitar ações duplicadas.
23. Como usuário, quero alertas de atenção com o popup fechado para não perder perguntas.
24. Como usuário, quero alertas de conclusão bem-sucedida de um turno para saber
    quando posso revisar o resultado, mesmo com a conversa ainda aberta.
25. Como usuário, quero cada evento notificado uma única vez para evitar alertas repetidos.
26. Como usuário, quero iniciar o Strata sem alertas retroativos para não confundir
    eventos antigos com novidades.
27. Como usuário, quero que uma falha de integração preserve as outras ferramentas
    para continuar acompanhando as sessões disponíveis.
28. Como usuário, quero que o Strata mantenha apenas metadados e perguntas necessários
    em memória para não criar outra cópia persistente do histórico de conversas.
29. Como usuário com vários monitores, quero uma visão coerente das sessões para
    acompanhar o mesmo trabalho por qualquer barra.
30. Como usuário de teclado, quero reutilizar foco e fechamento do popup existente
    para operar inputs e ações de forma previsível.
31. Como usuário do studio, quero dados demonstrativos identificados para distingui-los
    das sessões reais do Windows.

## Implementation Decisions

- Alvos confirmados: ChatGPT Desktop, OpenCode e Antigravity. Codex não faz parte
  do escopo acordado.
- Reutilizar o framework de WidgetPopup, seu host compartilhado, foco, geometria
  e ciclo de vida; a feature fornece conteúdo, dados e ações.
- Usar um serviço Rust compartilhado, independente da visibilidade do popup,
  seguindo o padrão dos lembretes para snapshots versionados e eventos.
- Derivar AgentType, AgentSession, SessionStatus e AgentMessage de contratos Rust
  via geração TypeScript, sem duplicar manualmente os modelos.
- Usar adapter nativo separado do demo e store Zustand com validação dos payloads,
  inicialização sem perda de eventos e rejeição de snapshots antigos.
- Separar capacidades de detectar aplicativo, listar sessões, observar estados e
  perguntas, criar sessão, responder e aprovar/recusar. Uma capacidade não implica outra.
- Presença de processo não comprova sessão, processamento, pergunta ou conclusão.
- Validar APIs/eventos locais do OpenCode e hooks do Antigravity como fontes
  candidatas. Não há fonte de sessões do ChatGPT Desktop comprovada no levantamento.
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
- Ao desconectar, desabilitar respostas e reconciliar estado antes de reabilitá-las;
  não reenviar ações automaticamente.
- Estabelecer linha de base inicial sem notificações retroativas. Deduplicar eventos
  de atenção e conclusão entre atualizações e consumidores.
- Notificar com o popup fechado. Integrar notificações nativas do Windows 11 quando
  suportadas; o mecanismo exato ainda deve ser validado, pois não existe toast na
  infraestrutura identificada. O alerta no popup faz parte do escopo.
- Coletar somente metadados e conteúdo de perguntas pendentes necessários ao popup,
  mantidos em memória; não persistir histórico pelo Strata.
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

- Codex, agentes adicionais e integrações com chats apenas no navegador.
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

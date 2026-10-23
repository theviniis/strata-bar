## Problem Statement

As preferências dos widgets estão distribuídas entre popups, Aparência e Layout.
O usuário precisa procurar opções em lugares diferentes e encontra controles
duplicados. Algumas alterações feitas nos popups ficam apenas no estado local,
sem persistência nativa ou propagação confiável para outras barras.

## Solution

Configurações será a única fonte de verdade das preferências de TODOS os widgets.
Agentes, Lembretes, Entrada de áudio, Saída de áudio e Player de música terão
seções próprias, com os mesmos nomes usados na interface dos widgets. Todos os
demais widgets serão auditados para eliminar configurações fora desse fluxo.

Preferências passam pelo Draft e por Aplicar/Reverter. Ações de conexão de contas
e configuração de hooks continuam imediatas, com esse efeito indicado na interface.
Os widgets mantêm suas ações diárias, perdem engrenagens e formulários de
configuração, e orientam por texto quando uma integração precisa ser configurada.

## User Stories

1. Como usuário do Strata, quero configurar qualquer widget em Configurações, para ter um único lugar para suas preferências.
2. Como usuário do Strata, quero uma seção Agentes, para selecionar agentes visíveis e configurar suas integrações.
3. Como usuário do Strata, quero conectar ou desconectar OpenCode em Agentes, para administrar a integração no lugar esperado.
4. Como usuário do Strata, quero ativar ou desativar hooks de Codex e Antigravity em Agentes, para controlar essas integrações.
5. Como usuário do Strata, quero continuar consultando sessões e respondendo aos agentes no widget, para trabalhar sem abrir Configurações.
6. Como usuário do Strata, quero continuar atendendo permissões e alertas no widget de agentes, para preservar meu fluxo diário.
7. Como usuário do Strata, quero uma seção Lembretes, para configurar a integração com Google Calendar.
8. Como usuário do Strata, quero informar as credenciais e conectar ou desconectar Google Calendar nessa seção, para gerenciar a conta de forma centralizada.
9. Como usuário do Strata, quero continuar criando, consultando e editando lembretes no widget, para manter o acesso rápido.
10. Como usuário do Strata, quero continuar adiando e concluindo lembretes no widget, para agir sem entrar em Configurações.
11. Como usuário do Strata, quero uma seção Entrada de áudio, para escolher a fonte Windows ou Voicemeeter e o strip correspondente.
12. Como usuário do Strata, quero uma seção Saída de áudio, para escolher a fonte Windows ou Voicemeeter e o bus correspondente.
13. Como usuário do Strata, quero conservar as opções existentes de roteamento e identificação de áudio, para reorganizar a interface sem perder recursos.
14. Como usuário do Strata, quero continuar selecionando dispositivos Windows nos widgets de áudio, para trocar rapidamente meus dispositivos.
15. Como usuário do Strata, quero continuar ajustando volume e mute nos widgets, para manter controles cotidianos acessíveis.
16. Como usuário do Strata, quero uma seção Player de música, para configurar o Client ID e conectar ou desconectar Spotify.
17. Como usuário do Strata, quero continuar usando reprodução, progresso, volume e favoritos no player, para controlar músicas diretamente na barra.
18. Como usuário do Strata, quero editar preferências em um Draft, para revisar mudanças antes de afetar as barras.
19. Como usuário do Strata, quero usar Aplicar para validar e salvar as preferências, para torná-las persistentes e visíveis nas barras correspondentes.
20. Como usuário do Strata, quero usar Reverter para descartar preferências pendentes, para recuperar a configuração salva.
21. Como usuário do Strata, quero que uma falha de validação ou gravação preserve a configuração salva e mostre o erro, para não perder uma configuração funcional.
22. Como usuário do Strata, quero reabrir o aplicativo e encontrar as preferências aplicadas, para não refazer minha configuração.
23. Como usuário com vários monitores, quero preservar as opções existentes por monitor e instância, para personalizar cada barra pela mesma fonte de verdade.
24. Como usuário com vários monitores, quero que alterações aplicadas se propaguem às barras afetadas, para evitar estados divergentes.
25. Como usuário de Voicemeeter, quero entender quando um ajuste tem alcance global, para saber quais barras serão afetadas.
26. Como usuário do Strata, quero identificar que conectar contas e ativar hooks tem efeito imediato, para não esperar que Reverter desfaça essas operações.
27. Como usuário do Strata, quero popups sem engrenagens ou formulários de configuração, para concentrar seu uso nas ações diárias.
28. Como usuário do Strata, quero uma orientação textual quando faltar configurar uma integração, para encontrar sua seção sem um novo botão no widget.
29. Como usuário do Strata, quero evitar controles de preferências duplicados em Aparência e Layout, para não encontrar caminhos concorrentes de edição.
30. Como usuário do Strata, quero continuar adicionando, removendo e posicionando widgets em Layout, para organizar a composição da barra.
31. Como usuário do Strata, quero que os editores visual e JSON representem o mesmo Draft, para que ambos mantenham as preferências consistentes.
32. Como usuário do Strata, quero que falhas nativas de integração sejam mostradas sem valores de demonstração, para confiar no estado apresentado.

## Implementation Decisions

- Auditar todos os widgets, seus popups e caminhos de mutação de preferências; a regra de fonte única não se limita às cinco seções nomeadas.
- Usar o fluxo existente da Settings window: Draft compartilhado entre editores visual e JSON, Aplicar com validação nativa e gravação atômica, seguido de eventos de configuração para atualizar as barras.
- Alterações de preferências não podem mudar as barras antes de Aplicar. Reverter recarrega a configuração salva e descarta edições pendentes.
- Remover mutações locais de preferências que contornem a persistência nativa. Stores nas barras são consumidores do documento salvo, sem uma fonte concorrente de preferências.
- Preservar as opções existentes por monitor e instância de widget; fonte única não significa valores iguais para todos. Não converter integrações globais em integrações independentes por monitor.
- Manter o alcance global existente do roteamento de áudio por canal e indicá-lo na interface. Não introduzir roteamentos concorrentes por monitor.
- Adicionar as cinco seções próprias e mover para elas os controles existentes de agentes, Google Calendar, Voicemeeter e Spotify. Preservar todas as opções existentes, incluindo fonte, alvo e identificação do áudio.
- Remover de Aparência e do inspetor de Layout os controles específicos agora pertencentes às seções dedicadas. Layout mantém composição e posicionamento; o editor JSON permanece uma representação do mesmo Draft.
- Remover botões de engrenagem e formulários de configuração dos popups, sem substituí-los por atalhos de configuração. Integrações não configuradas exibem orientação textual nomeando a seção correspondente.
- Manter ações cotidianas nos widgets: agentes e permissões, operações de lembretes, seleção de endpoints Windows, volume/mute e controles do player.
- Conexão/desconexão de contas e instalação/remoção de hooks continuam operações explícitas de efeito imediato, separadas das preferências do Draft. A interface esclarece que Reverter não desfaz seus efeitos externos.
- Reutilizar os mecanismos existentes de armazenamento seguro de credenciais; não incorporar segredos ao JSON de preferências.
- Ajustar bridge, comandos e permissões nativas somente onde necessário para permitir as operações migradas a partir da Settings window. Manter validação nativa e restrição de callers; controles Spotify hoje restritos a barras/overlay precisam funcionar em Configurações.
- Preservar as invariantes nativas existentes, incluindo ausência de fallback para demo em falhas, escopo de capacidades, CSP e ciclo de vida de AppBars/overlay.
- Não há decisão de introduzir um novo schema ou contrato geral de configuração; preferir os modelos e operações existentes, preservando documentos salvos e opções já suportadas.

## Testing Decisions

- Pontos de teste confirmados pelo usuário: Settings window como fronteira principal, complementada pelos popups e pelos comandos nativos necessários. Reutilizar essas fronteiras existentes, sem criar uma arquitetura de testes distribuída por cada controle.
- Testar comportamento observável: editar uma preferência não altera a configuração salva; Aplicar valida, persiste e atualiza as barras; Reverter descarta mudanças; reabrir recupera os valores salvos. Não testar detalhes de componentes internos ou organização de funções.
- Cobrir falhas de validação/gravação, preservação da configuração anterior, consistência entre editores visual/JSON e projeção correta por monitor/instância.
- Usar como referência as suítes existentes de SettingsView, configuração/hidratação, isolamento nativo e configuração das barras, que já exercitam Draft, bridge e eventos entre janelas.
- Testar navegação e operação das cinco seções, incluindo configurações de integrações, erros apresentados e distinção entre Aplicar/Reverter e ações imediatas.
- Reaproveitar as suítes de Spotify/Calendar settings e agentes como referência para conectar/desconectar e configurar hooks. Confirmar que Reverter não promete nem executa reversão dessas ações externas.
- Usar as suítes de agentes, lembretes, música e áudio para verificar que engrenagens/formulários foram removidos, orientações textuais aparecem quando necessário e ações diárias continuam funcionando.
- Cobrir no host nativo o salvamento e as políticas de caller dos comandos migrados: Configurações pode executar apenas operações autorizadas, callers indevidos continuam rejeitados e entradas inválidas continuam validadas.
- Validar no Windows real o ciclo salvar/reabrir/propagar para barras e o funcionamento das integrações disponíveis. Testes com mocks não substituem a verificação nativa; registrar limitações de integrações indisponíveis sem declarar sucesso por simulação.
- Executar os gates pertinentes de formatação, lint, tipos, testes frontend e testes Rust. Não adicionar testes que apenas espelhem a implementação.

## Out of Scope

- Novas integrações, novas preferências ou novos recursos de widgets.
- Roteamento de áudio independente por monitor ou mudança do alcance global das integrações existentes.
- Remover dos widgets ações diárias como seleção de dispositivo, volume, reprodução ou gestão de lembretes.
- Fazer Aplicar/Reverter controlar transações OAuth ou desfazer hooks já instalados.
- Substituir engrenagens por outros botões ou links de configuração nos widgets.
- Reformular geometria de AppBars, overlay, coleta de métricas ou segurança geral da aplicação.
- Criar um novo harness de e2e ou reescrever o sistema de configuração.

## Further Notes

- Especificação sintetizada da entrevista de design e das confirmações do usuário. As decisões de produto e os pontos de teste foram confirmados; a publicação não implica início da implementação.
- Configurações é a fonte de verdade de preferências. Estado operacional de serviços externos, sessões, playback e dispositivos continua nos serviços responsáveis, com suas ações diárias acessíveis nos widgets.
- O inventário das cinco integrações é conhecido. A auditoria dos demais widgets faz parte da implementação para garantir a regra global sem inventar novas opções.

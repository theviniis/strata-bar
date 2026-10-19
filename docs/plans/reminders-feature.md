# Lembretes

Implementar uma subtask por vez. Subtask 1 concluída; continuação autorizada para
Google Calendar, widget/formulário e notificações, nessa ordem.
Google Calendar é opcional; snooze altera apenas o alerta local. Ao reabrir o
Strata, o futuro scheduler apresentará lembretes vencidos. OAuth, UI e scheduler
não fizeram parte da primeira etapa.

## Decisões da continuação

- Google Calendar é opt-in por lembrete; agenda principal da conta conectada.
- OAuth de aplicativo Desktop, navegador do sistema, loopback com porta dinâmica,
  state e PKCE. Tokens e client secret ficam no Windows Credential Manager.
- Falha do Google não remove o lembrete local. Erro fica persistido e a interface
  oferece nova tentativa usando ID de evento determinístico para evitar duplicatas.
- Alertas nativos usam a superfície flutuante existente, com fila persistida no
  host e som nativo. Dispensar/adiar persistem antes de avançar na fila.
- Datas/horários são escolhidos no fuso local; instantes persistidos são UTC.

## Subtask 1: Arquitetura, Tipos e Persistência

- [x] Definir `Reminder`, `ReminderMode` e `SnoozeOption` a partir do contrato Rust.
- [x] Implementar persistência local entre sessões, com validação e escrita atômica.
- [x] Criar store Zustand sincronizada entre consumidores e seletor de countdown.

## Subtask 2: Integração com Google Calendar

- [x] Implementar serviço de comunicação com Google Calendar.
- [x] Criar evento de 5 minutos no modo Duração.
- [x] Criar evento com data, hora e duração customizada no modo Data/Hora.

## Subtask 3: Widget e criação

- [x] Criar widget com ícone e countdown condicional inferior a 12 horas.
- [x] Criar formulário conforme o Design System.
- [x] Implementar duração, DatePicker, horário, duração do evento e mensagem.

## Subtask 4: Notificações

- [x] Criar scheduler em background enquanto o Strata estiver aberto.
- [x] Implementar popup de alerta e som.
- [x] Implementar Dispensar e Adiar, com opções de 5, 10, 15 e 30 minutos.

## Contrato e validação da primeira etapa

Rust é a autoridade nativa; snapshots revisionados alimentam Zustand. Documento
versionado em `app_data_dir()/reminders.json`; studio isolado em
`strata.reminders.v1`. Instantes são milissegundos UTC. Erros de leitura bloqueiam
mutações e preservam o arquivo. Escritas falhas não alteram o snapshot publicado.
Nenhuma falha nativa pode recorrer ao adaptador de demonstração.

Verificar round-trip, recarga, corrupção, versão desconhecida, falha de escrita,
snooze/dispensa persistidos, sincronização e snapshots antigos; limites de 12h.
Preservar alterações preexistentes de música, Spotify e volume.

### Entrega da Subtask 1

- Contrato em `src-tauri/src/reminders_contract.rs`; `cargo build/test` gera os
  tipos TypeScript. IDs UUID v4; duração do evento em segundos; horários UTC em ms.
- Comandos `reminders_snapshot`, `reminders_create` e `reminders_transition`
  permitidos apenas para `bar-*` e `overlay`. Transição com `snooze: null` dispensa;
  valores `"5"`, `"10"`, `"15"` e `"30"` adiam. Cada gravação publica
  `reminders:snapshot` com revisão crescente.
- `getRemindersStore()` disponibiliza o hook Zustand e ações `connect`, `create`,
  `dismiss` e `snooze`. A conexão inicia no bootstrap; listener precede snapshot.
  Erros ficam em `error`; `source` distingue `native` e `demo`.
- `nextReminder` seleciona o próximo agendado estritamente entre zero e 12 horas.
  Lembretes vencidos permanecem salvos; sua apresentação depende da Subtask 4.
- Validação: suíte completa de frontend aprovada (32 arquivos, 153 testes),
  incluindo 9 testes de lembretes; 92 testes Rust aprovados e 2 ignorados,
  incluindo 5 novos testes de persistência. TypeScript, ESLint e Prettier dos
  arquivos alterados aprovados; `git diff --check` sem erros.

Nenhum fluxo Google Calendar, formulário, widget, scheduler, popup ou som foi
implementado nesta etapa. As transições de snooze/dispensa já estão preparadas
na camada de dados, sem controles visuais.

### Google Calendar: configuração e contrato

O usuário habilita Google Calendar API no projeto Google Cloud, configura a tela
de consentimento (e usuários de teste, se necessário) e cria credenciais OAuth do
tipo **Desktop app**. O formulário de integração recebe Client ID e Client Secret
opcional. Não colocar credenciais em `.env`, no repositório ou no localStorage.
O callback usa `127.0.0.1` com porta dinâmica; não configurar credenciais Web.

Comandos `calendar_status`, `calendar_connect`, `calendar_disconnect` expõem
somente estado de conexão, nunca tokens. Desconectar remove credenciais locais;
não exclui eventos criados na conta. `syncCalendar` é opt-in na criação e
`reminders_calendar_sync` permite repetir falhas. O ID deriva do UUID do lembrete,
sem hífens; conflitos são confirmados pelo identificador privado do lembrete.
O evento usa o horário original, nunca o horário de snooze, e não convida pessoas.

Fontes: [OAuth Desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
e [Calendar events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
Os testes locais cobrem callback/state, refresh, escopo, payload UTC, duração e
persistência das falhas/repetições. Autorização e criação reais exigem credenciais
e consentimento da conta Google; não foram executadas automaticamente.

### Entrega da Subtask 3

Sino ao lado do relógio na barra nativa e widget registrado no studio/configuração.
Popup compartilhado com formulário, DatePicker, lista de ativos, dispensa e retry
Google; duração fixa de 5 minutos para eventos de timers. Countdown só aparece
para o próximo agendado abaixo de 12h. Testes de UI aprovados (4), além de barra,
studio e configuração (9); TypeScript e ESLint aprovados. Preview conferido no
navegador e registrado em `docs/evidence/reminders-studio.png`.

### Entrega da Subtask 4 e validação final

- Um scheduler Rust atende todos os monitores e persiste `ringing` antes de
  apresentar alertas. Fica bloqueado sem lembretes agendados e verifica saltos do
  relógio/retorno de suspensão em até 30 segundos quando há agendamentos.
- Alertas usam o overlay existente, no monitor em foco, sem nova janela ou
  reserva AppBar. A fila aguarda popups existentes e aplicativos fullscreen.
  Cada ocorrência toca `MessageBeep` uma vez; o volume/som depende do Windows.
- Dispensar e adiar só fecham o alerta após gravar. Escape/blur mantêm pendência
  acessível pelo sino, sem reabrir em loop. Ao reiniciar, os vencidos reaparecem.
  Snooze não altera eventos Google. Falhas de escrita são expostas à UI e
  tentadas novamente com intervalo de 30 segundos, evitando loop de gravações.
- Studio possui scheduler e alerta de demonstração. Som via Web Audio pode
  exigir o botão de ativação, conforme a política de autoplay do navegador.
- `pnpm check`: aprovado, 33 arquivos e 161 testes. Rust: 98 aprovados e 2
  ignorados. Foram exercitados persistência, concorrência, vencimento, recarga,
  snooze, filas e falha de gravação ao dispensar. `pnpm build` aprovado;
  `git diff --check` sem erros.
- Conferência no navegador: timer de 1 minuto criado, popup aberto ao vencer,
  som ativado, snooze de 5 minutos refletido no contador e dispensa persistida.
  Evidência visual: `docs/evidence/reminders-alert-studio.png`.
- Probe de janelas nativas confirmou duas barras, inclusive monitor com origem
  negativa, e overlay com estilos esperados e exclusão do komorebi. Registro em
  `docs/evidence/reminders-native-geometry-2026-10-19.json`.

Limites: o probe nativo verifica geometria/estilos; não é um teste de interação
do formulário/alerta nativo nem uma confirmação auditiva. O código Win32 e a
persistência foram compilados/testados no Windows. Login e criação real no
Google Calendar ainda exigem credenciais Desktop e consentimento da conta;
não foram validados com uma conta conectada nesta sessão. A aplicação precisa
estar aberta para alertar no horário; caso contrário, alerta na próxima abertura.

### Validação nativa complementar

- [x] Separar som do vencimento e apresentação visual para não atrasar o som
      quando o overlay estiver ocupado; evitar som duplicado entre monitores.
- [x] Testar fila, snooze e entrega sonora; executar teste explícito da API de
      som do Windows, sem alterar dados de lembretes ou a conta Google.
- [x] Atualizar os resultados e os limites de validação.

O scheduler agora entrega o som assim que encontra uma ocorrência `ringing`,
independentemente de outro popup ou fullscreen. A apresentação visual continua
na fila existente. O cache de som é separado do cache de apresentação e é limpo
ao adiar/dispensar, impedindo repetições na mesma ocorrência.

O teste `sounds_due_occurrences_once_without_waiting_for_popup_delivery` cobre
dois vencimentos simultâneos, leituras repetidas, snooze e dispensa. O teste
explícito `live_windows_reminder_sound_request_succeeds` passou: a API Win32
aceitou a solicitação real do som. Isso não confirma audibilidade física, que
depende do volume e da configuração de sons do Windows. Executá-lo novamente:

```sh
cargo test --manifest-path src-tauri/Cargo.toml live_windows_reminder_sound_request_succeeds -- --ignored
```

O teste sonoro é ignorado nos gates comuns para não emitir som em cada execução.
Após a correção, a suíte Rust completa passou: 99 aprovados, 3 ignorados;
o teste sonoro ignorado também passou ao ser executado explicitamente.
Esta etapa não exerceu a interação do popup nativo nem o consentimento Google;
os limites anteriores continuam aplicáveis.

### Ajuste de configuração Google

- [x] Substituir a seção expansível por engrenagem no cabeçalho, abrindo Dialog
      inline no mesmo padrão do Spotify e dentro da superfície nativa existente.
- [x] Preservar formulário/draft, retorno de foco e Escape fechando só o Dialog;
      manter o estado de conexão disponível sem precisar abrir configurações.
- [x] Verificar testes, formatação, tipos e visualização no studio.

Configuração Google agora segue o padrão do Spotify: engrenagem no cabeçalho,
Dialog inline com título/descrição e formulário de conexão. No studio os campos
aparecem desabilitados e explicitamente identificados como demonstração.
Conexões existentes são consultadas sem precisar abrir o Dialog, mantendo a
opção de criar eventos disponível no formulário de lembretes.

Validação: 13 testes relevantes aprovados (lembretes/configuração Google e
Dialog Spotify), TypeScript e ESLint aprovados. Conferência visual registrada
em `docs/evidence/reminders-google-settings-dialog.png`.

### Seletor de modo com Tabs

- [x] Substituir dropdown por abas Duração e Data e hora, usando Tabs de Base UI
      conforme a referência shadcn, com painéis associados e campos preservados.
- [x] Atualizar teste de seleção do modo e conferir alternância no studio.

O componente compartilhado `ui/tabs.tsx`, antes sem consumidores, agora usa
`@base-ui/react/tabs` já instalado. Nenhuma dependência nova. Testes relevantes:
11 aprovados; TypeScript, ESLint e formatação aprovados.
Conferência visual em `docs/evidence/reminders-mode-tabs.png`.
Referência: [Tabs Base UI](https://ui.shadcn.com/docs/components/base/tabs).

### Atalhos de duração

- [x] Adicionar botões +5, +10, +25 e +30 minutos na aba Duração, somando ao
      campo atual sem enviar o formulário. Desabilitados enquanto salva.
- [x] Verificar os quatro acréscimos e a criação com a duração resultante;
      conferir visualmente no studio.

Teste de criação atualizado para acumular 5 + 5 + 10 + 25 + 30 = 75 minutos,
preservando o evento Google de 5 minutos. Os 9 testes de UI passaram, assim
como TypeScript, ESLint e formatação. Evidência visual:
`docs/evidence/reminders-duration-shortcuts.png`.

### Duração em horas e minutos

- [x] Substituir o campo único por Inputs shadcn de Horas e Minutos,
      iniciando em 0h05; validar inteiros, minutos de 0 a 59 e total positivo.
- [x] Converter para segundos sem alterar o contrato ou o evento Google de 5min.
- [x] Preservar os atalhos atuais (+5, +10, +20, +30), normalizando horas/minutos.
- [x] Testar criação acima de 24h, total zero, minutos inválidos e virada de hora.

Validação: 15 testes de UI aprovados. ESLint e Prettier dos arquivos alterados
aprovados. Typecheck global bloqueado por erros nos componentes existentes
button-loading.tsx e AudioOutputs.tsx relacionados à exportação ButtonProps
de ui/button.tsx; esses arquivos não foram alterados nesta etapa.

### Seletores compactos de data e hora

- [x] Calendar em Popover com dropdown de mes/ano e horario ao lado.
- [x] Input time na aba Duracao (HH:mm), inicial 00:05, com atalhos existentes.
- [x] Bloquear zero e incremento acima de 23h59 sem voltar para zero.
- [x] Reservar espaco no popup nativo para abrir o calendario na mesma janela.

O seletor substitui os campos numericos anteriores. A interface aceita de
1 minuto a 23h59; registros existentes e contrato nativo permanecem intactos.
Evento Google de 5 minutos preservado. Precisao de minutos nos dois modos.

Validacao: 14 testes UI aprovados, ESLint e Prettier aprovados. Typecheck
bloqueado pelos erros existentes de ButtonProps em button-loading.tsx e volume.
Interacao visual nativa nao exercida nesta etapa.

### Mascara HH:mm na duracao

- [x] Substituir Input time por texto com mascara HH:mm e teclado numerico.
- [x] Selecionar minutos ao focar por teclado ou primeiro clique/toque,
      permitindo selecionar as horas manualmente depois.
- [x] Preservar validacao, limite 23h59 e atalhos.
- [x] Verificar foco, selecao, entrada/paste de digitos e regressao de criacao.

Validacao: 15 testes UI aprovados; ESLint e Prettier dos arquivos alterados
aprovados. Nenhuma alteracao no contrato nativo ou modo Data e hora.

### Estilo do campo de duracao

- [x] Remover font-mono e tabular-nums introduzidos com a mascara para restaurar
      a tipografia padrao do Input anterior, mantendo fundo e appearance-none.
      Mascara e selecao automatica dos minutos preservadas.

### Formulario com React Hook Form e Zod

- [x] Integrar react-hook-form e zodResolver, com tipos inferidos do schema.
- [x] Centralizar mensagem, modo, duracao, data/horario, duracao do evento e
      opcao Google no formulario, preservando draft ao alternar abas/Dialog.
- [x] Validar somente os campos do modo ativo, rejeitar mensagem vazia e
      mostrar erro acessivel com aria-invalid nos inputs.
- [x] Enviar por Enter nos inputs (exceto composicao IME), sem enviar ao usar
      atalhos, calendario, abas ou configuracoes; impedir criacoes concorrentes.
- [x] Manter a validacao nativa e confirmar criacao somente apos persistencia.

Validacao: 17 testes UI aprovados, incluindo Enter nos dois modos, mensagem
em branco, trim e campos invalidos da aba inativa. ESLint e Prettier aprovados.
Typecheck global ainda bloqueado pelos erros existentes em ButtonProps/volume.
Dependencias adicionadas pelo pnpm, sem edicao manual do lockfile.

### Checkbox Google conectado por padrao

- [x] Reproduzir checkbox habilitado mas desmarcado apos carregar conexao.
- [x] Remover defaultChecked redundante e atualizar syncCalendar no formulario
      quando a conexao muda, inclusive ao conectar/desconectar no Dialog.
- [x] Preservar desmarcacao manual quando a mesma conexao e consultada novamente.
- [x] Cobrir conexao existente, escolha manual, nova conexao e desconexao.

Causa: checked controlado pelo React Hook Form iniciava false e prevalecia
sobre defaultChecked. Correcao aplica o padrao ao mudar o estado de conexao.

### Calendario flutuante sem expansao

- [x] Remover reserva de altura e mudanca de layout ao abrir calendario nativo.
- [x] Manter Calendar no Portal do Popover, flutuando sobre o formulario.
- [x] Habilitar ajuste de posicao por colisao nos dois ambientes e limitar altura
      ao espaco disponivel com rolagem, evitando corte na janela nativa.

### Direcao do calendario

- [x] Compartilhar o lado do popup pelo contexto e abrir o calendario na mesma
      direcao (abaixo para barra no topo; acima para barra inferior).
- [x] Desativar inversao automatica por colisao; manter limite de altura/rolagem
      sem expandir o formulario.
- [x] Cobrir os dois lados nos testes de componente.

### Atalhos de data

- [x] Adicionar Hoje, Amanha, Sabado e Domingo na aba Data e hora.
- [x] Calcular a partir do dia local atual; fim de semana inclui hoje quando
      corresponde ao dia escolhido. Preservar horario e duracao do evento.
- [x] Nao enviar formulario ao usar atalhos; fechar calendario aberto e validar.
- [x] Testar sexta/sabado/domingo e virada do ano sem alterar horario nem criar
      lembrete antes do envio.

Validacao: 22 testes UI aprovados; ESLint e Prettier aprovados.

### Lembretes ativos em Accordion

- [x] Criar componente compartilhado baseado no Accordion Base UI da referencia
      shadcn, usando a dependencia ja instalada.
- [x] Agrupar lista e estado vazio em Ativos (N), fechado por padrao e expansivel,
      mantendo todas as acoes existentes.
- [x] Verificar recolhimento/reabertura e preservacao dos lembretes no teste UI.

Referencia: https://ui.shadcn.com/docs/components/base/accordion

## Subtask 5: Editor, barra flutuante e código

- [x] Instalar Tiptap React, StarterKit, Markdown e BubbleMenu.
- [x] Integrar editor ao formulário com acessibilidade, draft e validação.
- [x] Converter atalhos ##, -, *, 1. e três crases seguidos de espaço.
- [x] Implementar BubbleMenu: negrito, itálico, tachado, código, links e títulos.
- [x] Estilizar bloco de código editável com Tailwind.
- [x] Enter edita; Ctrl+Enter salva, respeitando IME.
- [x] Persistir Markdown raw, rejeitar vazio e limitar a 2000 caracteres.
- [x] Validar testes e interação no studio; registrar limites.
- [ ] Conferir interação na superfície nativa com esta versão.

## Subtask 6: Markdown raw no Google Calendar

- [x] Testar round-trip de títulos, listas, marcas, links e código.
- [x] Enviar message como description raw no payload Google.
- [x] Preservar summary, horários, duração e idempotência.
- [x] Validar payload com testes Rust e registrar limites da conta real.

### Entrega da Subtask 5

Tiptap 3.32 integra o formulário, persistindo Markdown raw sem alterar tipos.
BubbleMenu permanece na mesma superfície e ajusta posição por colisão. Enter
edita; Ctrl+Enter envia. Blocos de código usam a extensão nativa, sem realce.
Mensagem sem texto é vazia; limite de 2000 caracteres inclui sintaxe Markdown.

Validação: 22 testes de UI e 6 testes de editor aprovados (atalhos, undo e
limite). Studio: h2 por teclado, seleção, negrito, aplicação de link, bloco de
código e criação com Ctrl+Enter conferidos; editor limpo após salvar. Evidência:
`docs/evidence/reminders-markdown-editor-2026-10-19.png`.
Typecheck global continua bloqueado pelos erros preexistentes de ButtonProps
em button-loading.tsx/AudioOutputs.tsx. Nenhum erro apontado nos arquivos novos.
Interação nativa pendente: existe uma instância de outro worktree em execução;
o mutex impede outra instância. Essa instância foi preservada. A validação do
studio não substitui a conferência nativa.

### Entrega da Subtask 6

O payload nativo envia `description: reminder.message` como Markdown raw.
Summary, IDs, duração, opt-in e política de retry permanecem iguais. Não há
HTML nem conversão adicional no transporte. Round-trip cobre títulos, listas,
negrito/itálico/tachado, código inline, links HTTP/mailto e código com linguagem,
indentação e linhas vazias. A normalização de sintaxe pelo editor é esperada.

Validação: 12 testes de editor e 22 testes de lembretes aprovados; suíte completa
frontend com 35 arquivos/191 testes aprovada. Os 3 testes Rust de Google Calendar
passaram, incluindo descrição idêntica após serialização JSON e preservação de
summary, horários e ID. Build de produção, ESLint e Prettier dos arquivos
alterados e git diff --check aprovados. Build informa aviso de bundle grande.
Três testes adicionais de UI passaram: Enter/Ctrl+Enter/IME, limpeza do editor,
conteúdo formatado vazio, desabilitação durante envio e erro acessível. Total
focado: 37 testes aprovados.
Google real não exercitado: exige credenciais Desktop e consentimento da conta.
Conferência nativa e bloqueios globais de tipos permanecem registrados acima.

### Correcao de entrega do alerta nativo

- [x] Reproduzir fechamento prematuro do alerta quando o overlay ainda possui
      o snapshot anterior a expiracao.
- [x] Enviar a revisao minima com o popup e aguardar sua chegada antes de
      renderizar acoes ou fechar por snooze/dispensa.
- [x] Dar prioridade ao alerta sobre popups comuns, mantendo fila entre alertas
      e adiamento visual enquanto ha aplicativo em tela cheia.
- [x] Trocar MessageBeep por tom PCM proprio via PlaySoundW, independente do
      esquema de sons do Windows, e tentar novamente se a API falhar.
- [x] Cobrir snapshot atrasado, prioridade de popups, PCM valido e retry de som.

Validacao: 23 testes frontend de lembretes aprovados; TypeScript, ESLint e
Prettier aprovados. Suite Rust: 119 passaram, 9 ignorados; teste de audio Windows
executado explicitamente e aprovado. Esse teste confirma a chamada de reproducao,
nao confirma audicao fisica ou o roteamento/volume do dispositivo do usuario.
A interacao visual nativa completa nao foi automatizada nesta etapa.

### Fechamento explicito do alerta

- [x] Ignorar perda de foco/clique externo no alerta nativo e impedir que outro
      widget substitua um alerta aberto; preservar fechamento comum dos widgets.
- [x] Adicionar X no alerta e impedir Escape de fecha-lo.
- [x] Preservar Dispensar/Adiar e manter lembrete pendente quando fechado pelo X.
- [x] Cobrir Escape, clique externo, X e politica de fechamento nativa.

### Monitor principal e ancora do alerta

- [x] Escolher apenas a AppBar no monitor marcado como principal pelo Win32,
      independente do monitor da janela em foco.
- [x] Medir o widget de lembretes na barra, reportar seu retangulo em CSS px e
      revalidar contra GetWindowRect e escala reais no host.
- [x] Exigir medicao atualizada para cada ocorrencia antes de abrir o alerta;
      invalidar ancoras no reconcile de monitores/DPI.
- [x] Reutilizar posicionamento/clamp/seta do overlay com a ancora real.
- [x] Cobrir flag de monitor principal, limites da ancora, escala e medicao
      frontend com limpeza de listeners.

Validacao: 23 testes UI de lembretes e 2 testes de ancora aprovados; 19 testes
Rust de geometria/politica aprovados; TypeScript e ESLint aprovados.
Alinhamento visual nativo em multiplos monitores ainda exige verificacao manual.

### Alerta sem ativacao e adiamento em fullscreen

- [x] Abrir alerta com SW_SHOWNOACTIVATE, sem set_focus e sem autofocus React,
      mantendo widgets comuns com seu comportamento de foco existente.
- [x] Nao adicionar WS_EX_NOACTIVATE ao WebView2; interacao explicita continua
      disponivel ao clicar nos controles do alerta.
- [x] Conferir fullscreen pelo AppBar, estado de notificacao do Shell e
      retangulo da janela em foco, incluindo fullscreen sem bordas.
- [x] Revalidar fullscreen antes de revelar; recolocar na fila um alerta ocultado
      pela entrada em tela cheia, sem repetir o som ja emitido.
- [x] Testar preservacao do foco frontend e politica/geometria nativa.

A supressao se aplica ao popup; o som continua sendo emitido na expiracao.
Confirmacao pratica de foco/teclado/mouse em aplicativos nativos permanece manual.

### Componente de lembretes ativos e Markdown

- [x] Extrair Accordion, estado vazio, lista ordenada e acoes para
      ActiveReminders.tsx, preservando estado fechado inicial e operacoes.
- [x] Renderizar mensagens em ReminderMessage.tsx com o mesmo parser/schema
      Markdown do editor, em modo somente leitura e sem novas dependencias.
- [x] Cobrir formatacao, listas, citacoes, codigo, links, atualizacao do texto
      e rejeicao de HTML executavel/links javascript.

Validacao: 23 testes UI e 2 testes de renderizacao aprovados; TypeScript,
ESLint e Prettier dos arquivos alterados aprovados.

### Memoizacao da lista e Markdown

- [x] Memoizar ActiveReminders para evitar renders por alteracoes do formulario
      quando suas props e o snapshot permanecem iguais.
- [x] Memoizar filtro e ordenacao por referencia do array de lembretes.
- [x] Memoizar ReminderMessage por texto, evitando trabalho do editor somente
      leitura quando status, horario ou outra mensagem mudam.

### Markdown no alerta

- [x] Reutilizar ReminderMessage no popup de alerta, preservando limite de altura
      e rolagem, acoes, sincronizacao e abertura sem autofocus.
- [x] Cobrir formatacao Markdown no alerta e preservacao do foco.

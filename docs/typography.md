# Tipografia

A interface usa Geist Variable, distribuída localmente. `font-sans` e
`font-heading` apontam para a mesma família; `font-mono` fica reservado a código.
Os tokens estão em `src/app/styles.css` e incluem tamanho, entrelinha e peso.

| Classe          | Tamanho / entrelinha | Peso | Uso                                     |
| --------------- | -------------------- | ---- | --------------------------------------- |
| `text-micro`    | 10 / 14 px           | 400  | Eixos, unidades e metadados auxiliares  |
| `text-bar`      | 11 / 14 px           | 500  | Rótulos e leituras na barra             |
| `text-caption`  | 12 / 16 px           | 400  | Descrições, ajuda e estados secundários |
| `text-body`     | 12 / 16 px           | 400  | Conteúdo compacto e valores             |
| `text-control`  | 12 / 16 px           | 500  | Botões, campos e menus                  |
| `text-subtitle` | 12 / 16 px           | 600  | Grupos e seções internas                |
| `text-title`    | 14 / 20 px           | 600  | Títulos de cards e popups               |
| `text-page`     | 18 / 24 px           | 600  | Títulos de páginas                      |

Não usar microtexto para instruções, erros ou ações fora da barra. Valores
importantes podem usar `font-medium`; bold fica reservado a destaques e conteúdo
rico. Métricas e horários usam `tabular-nums`. Evitar overrides locais de
entrelinha e tamanho nos componentes compartilhados.

As exceções são `text-clock-display` (70 px, entrelinha 1) e
`text-studio-display` (clamp de 40 a 64 px, entrelinha 1.08), com
`tracking-display` no título do studio.

A entrada da aplicação carrega os pesos 400, 500, 600 e 700 antes de montar o
React para que a primeira medição de tooltip/popup já use Geist. A barra e o
overlay compartilham `font-sans text-bar`; o pill de tooltip define explicitamente
`text-caption font-normal` tanto na medição invisível quanto na renderização.

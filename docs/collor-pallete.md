# Paletas de cores

Este documento foi substituído. A fonte de verdade dos valores de cor é
`src/services/theme/palettes.ts`, aplicada em runtime por
`themeStyle(palette, mode)` e exposta ao Tailwind pelos aliases semânticos de
`src/app/styles.css`. Ao alterar uma cor, edite todas as paletas e modos em
`palettes.ts`; não mantenha valores HSL duplicados aqui.

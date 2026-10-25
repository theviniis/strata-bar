# Glass sutil

O efeito de vidro da interface combina fundo translúcido, desfoque do conteúdo
atrás da superfície, contorno delicado e sombras leves. Não usa gradiente.

## Elementos

| Elemento          | Classes Tailwind                                    | Função                                                |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Fundo translúcido | `bg-muted/30`                                       | Aplica a cor semântica `muted` com 30% de opacidade.  |
| Desfoque          | `backdrop-blur-md`                                  | Desfoca o conteúdo atrás da superfície.               |
| Contorno          | `border border-border/50`                           | Delimita a superfície com uma borda semitransparente. |
| Sombra externa    | `shadow-sm shadow-foreground/5`                     | Separa discretamente a superfície do fundo.           |
| Reflexo interno   | `inset-shadow-[0_1px_0] inset-shadow-background/40` | Cria uma linha de brilho na borda superior interna.   |
| Cantos            | `rounded-md`                                        | Suaviza o formato; adapte ao raio do componente.      |

Transparência e desfoque são a base do efeito. O contorno, o reflexo e a sombra
completam a aparência. As cores vêm dos tokens do tema, sem cores fixas.

## Receita reutilizável

```tsx
<div className="rounded-md border border-border/50 bg-muted/30 backdrop-blur-md shadow-sm shadow-foreground/5 inset-shadow-[0_1px_0] inset-shadow-background/40">
  Conteúdo
</div>
```

Adicione essas classes à definição visual do componente, preservando as classes
de tamanho, espaçamento, tipografia, foco, validação e estado desabilitado.
Evite repetir o estilo em cada uso do componente.

## Aplicação atual

- `src/components/ui/button.tsx`: variante `outline`. O hover e o estado expandido
  usam `bg-muted/50`, mantendo a translucidez. A classe `border` vem da base do
  Button.
- `src/components/ui/input.tsx` e `src/components/ui/textarea.tsx`: usam a receita
  com borda, preservando os estilos existentes de foco e estado desabilitado.
- `src/components/ui/tabs.tsx`: a lista usa `rounded-lg` e substitui a borda por
  `ring-1 ring-inset ring-border/50`, criando o contorno sem alterar as dimensões.
  O indicador da aba ativa mantém `bg-primary` e `text-primary-foreground`.

## Cuidados visuais

- O blur fica mais perceptível quando há cores, formas ou conteúdo atrás da
  superfície. Sobre um fundo uniforme, o desfoque quase não aparece.
- `backdrop-blur-md` desfoca o fundo, não o texto e os controles do componente.
- Use opacidade na cor do fundo, como `bg-muted/30`, em vez de `opacity-30`, que
  também reduziria a opacidade do conteúdo.
- O efeito CSS não cria transparência da janela nativa nem desfoque do desktop;
  ele atua sobre o fundo disponível na página.
- Preserve os indicadores de foco e erro. Ao usar um ring como contorno,
  confira se ele não substitui o ring de foco do controle.
- Confira temas claro e escuro, legibilidade, hover, foco e estado desabilitado.
- Mantenha o reflexo fino e as sombras suaves. Gradientes e brilho forte foram
  descartados por criarem aparência de relevo.

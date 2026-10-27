import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { WidgetItem } from '@/components/widget-item'
import { WidgetPopup } from './WidgetPopup'

const meta = {
  title: 'Composição/WidgetPopup',
  component: WidgetPopup.Root,
  subcomponents: { Trigger: WidgetPopup.Trigger, Anchor: WidgetPopup.Anchor },
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `API composta para abrir um **popup registrado** a partir de um widget.
A composição pertence ao controlador; o visual recebe o trigger, os callbacks e
as refs resultantes. O JSX fica em \`*.popup.tsx\`; os metadados de registro ficam em \`*.popup-definition.ts\`.

### Partes da composição

| Parte | Props e responsabilidade |
| --- | --- |
| \`Root\` | \`popup\`: ID registrado; \`params\`: entrada tipada pelo schema desse popup; \`children\`: composição do trigger/anchor. |
| \`Trigger\` | Botão que alterna abertura. Aceita atributos de botão, \`onClick\`, \`className\` e \`asChild\` (padrão \`false\`). |
| \`Anchor\` | Opcional: retângulo usado para posicionar o popup. Aceita atributos de div, \`className\` e \`asChild\` (padrão \`false\`). Sem anchor, usa o trigger. |

\`Trigger\` e \`Anchor\` precisam estar dentro de \`Root\`. Com \`asChild\`, forneça
um único elemento que encaminhe atributos, handlers e ref até o DOM. Evite botões
aninhados. \`data-popup-open\` permite destacar o trigger e a âncora.
No trigger nativo, \`event.preventDefault()\` no \`onClick\` impede a abertura.

\`\`\`tsx
<WidgetPopup.Root popup="cpu">
  <WidgetPopup.Trigger asChild>
    <WidgetItem aria-label="Detalhes da CPU">CPU 25.5%</WidgetItem>
  </WidgetPopup.Trigger>
</WidgetPopup.Root>
\`\`\`

### Parâmetros e conteúdo

O TypeScript relaciona \`popup\` a \`params\`; \`resolvePopup\` valida o schema
e rejeita chaves extras e payloads maiores que 16 KiB. CPU, memória e relógio,
por exemplo, aceitam parâmetros vazios. \`reminderAlert\` exige um UUID real
em \`params.id\` e aceita \`revision\` opcional. Callbacks não são parâmetros:
cada janela resolve suas próprias dependências no controlador do conteúdo.
\`Root\` não recebe conteúdo arbitrário nem props públicas \`open/onOpenChange\`.

### Browser e Windows

No browser, \`Root\` usa Radix Popover e \`PopupHost\` em modo demo, com portal,
colisão, tema herdado do trigger e animação de saída. As stories abaixo são
interativas e abrem conteúdo demo; não se conectam ao Tauri. Os popups de
recursos geram suas amostras ao abrir, por isso seus timestamps acompanham essa abertura.

No Windows, o hook abre a superfície overlay compartilhada e mantém uma sessão
por abertura. Clique externo e Escape fecham; a restauração de foco nativa depende
do evento \`overlay:closed\` e de \`restoreFocus\`. No browser, Escape restaura foco
no trigger, sem forçar foco na abertura. A coordenação mantém um popup ativo.
Erros de resolução/abertura aparecem com \`role="alert"\`.

Use **Widgets** e **Popups** para stories isoladas dos visuais. Estas stories
exercitam a infraestrutura de composição. O preview nativo inerte desativa o hook
de overlay; na documentação de \`Widget\`, o ancestral \`inert\` também impede interação.
A prévia no browser não comprova geometria, click-through ou foco Win32.`
      }
    }
  },
  argTypes: {
    popup: {
      control: 'select',
      options: ['cpu', 'memory', 'clock'],
      description:
        'ID do popup registrado; determina o tipo e o schema de params.'
    },
    params: {
      control: false,
      description:
        'Parâmetros serializáveis validados pelo schema do popup. Obrigatórios quando o schema exigir.'
    },
    children: {
      control: false,
      description:
        'Trigger e, opcionalmente, Anchor. O conteúdo é resolvido pelo registro.'
    }
  },
  args: {
    popup: 'cpu',
    params: undefined,
    children: (
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Abrir detalhes da CPU">CPU 25.5%</WidgetItem>
      </WidgetPopup.Trigger>
    )
  }
} satisfies Meta<typeof WidgetPopup.Root>
export default meta
type Story = StoryObj<typeof meta>

export const Trigger: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Abrir detalhes da CPU' })
    await userEvent.click(button)
    const page = within(canvasElement.ownerDocument.body)
    await expect(
      await page.findByText('Dados de demonstração · ilustrativos')
    ).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'false')
    )
    await expect(button).toHaveFocus()
  }
}
export const WholeWidgetAnchor: Story = {
  render: (args) => (
    <WidgetPopup.Root {...args}>
      <WidgetPopup.Anchor asChild>
        <div className="flex w-80 items-center justify-between rounded-md border p-3">
          <span className="text-xs text-muted-foreground">
            Âncora: widget completo
          </span>
          <WidgetPopup.Trigger asChild>
            <WidgetItem aria-label="Abrir detalhes">Abrir CPU</WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'O botão é o trigger; a âncora fornece a largura do widget inteiro para posicionamento. No Windows, a colocação final é responsabilidade do host.'
      }
    }
  }
}
export const Memory: Story = {
  args: {
    popup: 'memory',
    children: <WidgetPopup.Trigger>Detalhes da memória</WidgetPopup.Trigger>
  }
}
export const Disabled: Story = {
  args: {
    children: (
      <WidgetPopup.Trigger disabled>CPU indisponível</WidgetPopup.Trigger>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'disabled é atributo do botão Trigger. Root não possui uma prop disabled.'
      }
    }
  }
}
export const SingleActivePopup: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <WidgetPopup.Root popup="cpu">
        <WidgetPopup.Trigger>CPU</WidgetPopup.Trigger>
      </WidgetPopup.Root>
      <WidgetPopup.Root popup="memory">
        <WidgetPopup.Trigger>Memória</WidgetPopup.Trigger>
      </WidgetPopup.Root>
    </div>
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          'Abra CPU e depois Memória: o coordenador fecha o popup anterior.'
      }
    }
  }
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { widgetSchema, types } from '@/services/configuration/config'
import { Widget } from './Widget'
import { WidgetPreviewContext } from './widget-preview-context'

const meta = {
  title: 'Composição/Widget',
  component: Widget,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <WidgetPreviewContext value={true}>
        <div inert className="w-fit rounded-md border p-3">
          <Story />
        </div>
      </WidgetPreviewContext>
    )
  ],
  parameters: {
    docs: {
      description: {
        component: `Renderiza **uma instância configurada** de widget da barra nativa.
O registro seleciona o controlador por \`widget.type\` e fornece a apresentação
via \`WidgetViewContext\`. Cada controlador resolve seus dados, ações e estado
separadamente e entrega props ao visual da feature.

### Responsabilidades

- \`NativeBar\` decide presença, ordem, seção, espaçamento e configuração por monitor.
- \`Widget\` seleciona o controlador e projeta \`format\`, \`tooltip\`, \`intervalMs\` e \`audio\`.
- O controlador possui subscriptions, timers, tooltip e popup. O visual recebe props.
- \`enabled\` e \`id\` pertencem à configuração da instância; \`Widget\` não filtra
  \`enabled: false\` nem aplica posicionamento. Essa filtragem acontece no pai.

### Configuração

| Campo | Contrato |
| --- | --- |
| \`id\` | Identificador não vazio e único no layout. |
| \`type\` | Uma das 13 entradas do registro. Rede e janela ativa exibem indisponibilidade. |
| \`enabled\` | Padrão \`true\`; o pai controla se a instância é montada. |
| \`format\` | \`label\` (padrão) ou \`compact\`; cada feature interpreta sua apresentação. |
| \`tooltip\` | Padrão \`true\`; habilita tooltip de hover/foco no runtime nativo. |
| \`intervalMs\` | Inteiro de 1000 a 60000, padrão 2000. Canais orientados a eventos podem ignorá-lo. |
| \`audio\` | Opcional, consumido por volume/microfone: Windows ou Voicemeeter com destino strip/bus. |

Use \`widgetSchema.parse\` para preencher defaults e validar a configuração.

\`\`\`tsx
const widget = widgetSchema.parse({ id: 'cpu-main', type: 'cpu', format: 'label' })
<Widget widget={widget} />
\`\`\`

### Preview e isolamento

Estas stories envolvem o componente em \`WidgetPreviewContext value={true}\` e
um elemento \`inert\`: usam amostras estáticas e não iniciam subscriptions,
roteamento de áudio ou ações nativas. O provider é uma dependência dos
controladores, não dos visuais. Não copie esse provider para a barra em produção.
Para testar interações isoladas, use as stories dos visuais de cada feature;
para testar composição e abertura, veja **Composição/WidgetPopup**.

A toolbar alterna temas claro/escuro. Estes exemplos não validam AppBar,
geometria Win32, foco ou posicionamento da overlay nativa.`
      }
    }
  },
  argTypes: {
    widget: {
      control: 'object',
      description:
        'Configuração validada da instância (WidgetConfig, derivado do schema Zod).',
      table: { type: { summary: 'WidgetConfig' } }
    }
  },
  args: { widget: widgetSchema.parse({ id: 'cpu-story', type: 'cpu' }) }
} satisfies Meta<typeof Widget>
export default meta
type Story = StoryObj<typeof meta>

export const Label: Story = {}
export const Compact: Story = {
  args: {
    widget: widgetSchema.parse({
      id: 'cpu-compact',
      type: 'cpu',
      format: 'compact'
    })
  }
}
export const Memory: Story = {
  args: { widget: widgetSchema.parse({ id: 'memory-story', type: 'memory' }) }
}
export const WithoutTooltip: Story = {
  args: {
    widget: widgetSchema.parse({
      id: 'cpu-no-tooltip',
      type: 'cpu',
      tooltip: false
    })
  },
  parameters: {
    docs: {
      description: {
        story:
          'A configuração é propagada ao controlador. O preview permanece inerte; valide hover/foco no runtime nativo.'
      }
    }
  }
}
export const Voicemeeter: Story = {
  args: {
    widget: widgetSchema.parse({
      id: 'volume-vm',
      type: 'volume',
      audio: {
        source: 'voicemeeter',
        target: { kind: 'bus', index: 0 },
        label: 'Monitor'
      }
    })
  },
  parameters: {
    docs: {
      description: {
        story:
          'Destino tipado de áudio. O contexto de preview impede que esta story configure ou consulte o Voicemeeter.'
      }
    }
  }
}
export const Registry: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {types.map((type) => (
        <div key={type} className="flex items-center gap-4">
          <code className="w-28 text-xs text-muted-foreground">{type}</code>
          <Widget
            widget={widgetSchema.parse({ id: `registry-${type}`, type })}
          />
        </div>
      ))}
    </div>
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          'As 13 entradas registradas, usando os controladores reais com suas fontes de preview inerte.'
      }
    }
  }
}

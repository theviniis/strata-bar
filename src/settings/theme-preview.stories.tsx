import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { CpuPopup } from '@/features/cpu/popup/cpu.popup'
import { cpuFixture, CPU_FIXTURE_TIME } from '@/features/cpu/src/fixtures'
import {
  configSchema,
  colorThemeSchema,
  defaultConfig
} from '@/services/configuration/config'
import { colorThemes, themeStyle } from '@/services/theme/palettes'
import { BarSettings } from './bar-settings'
import type { ConfigDraft } from './draft'
import { ThemePreview } from './theme-preview'

const meta = {
  title: 'Settings/Color themes',
  component: ThemePreview,
  parameters: { layout: 'fullscreen' },
  args: { config: defaultConfig }
} satisfies Meta<typeof ThemePreview>
export default meta
type Story = StoryObj<typeof meta>

export const Selector: Story = {
  render: () => <SelectorExample />
}

function SelectorExample() {
  const [draft, setDraft] = useState<ConfigDraft>(defaultConfig)
  return (
    <div className="@container mx-auto max-w-3xl p-6">
      <BarSettings draft={configSchema.parse(draft)} onChange={setDraft} />
    </div>
  )
}

/** All ten appearances, with the actual bar and popup presentation. */
export const Gallery: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {colorThemeSchema.options.flatMap((colorTheme) =>
        (['light', 'dark'] as const).map((theme) => (
          <section
            key={`${colorTheme}-${theme}`}
            data-theme={theme}
            style={themeStyle(colorTheme, theme)}
            className={`group ${theme} flex flex-col gap-4 rounded-xl bg-background p-4 text-foreground`}
          >
            <h2 className="text-title">
              {colorThemes[colorTheme].label} ·{' '}
              {theme === 'light'
                ? colorThemes[colorTheme].lightLabel
                : colorThemes[colorTheme].darkLabel}
            </h2>
            <ThemePreview
              config={{
                ...defaultConfig,
                bar: { ...defaultConfig.bar, theme, colorTheme }
              }}
            />
            <Card className="w-full max-w-100 self-center">
              <CpuPopup
                lastData={undefined}
                event={{ status: 'ready', data: cpuFixture() }}
                now={CPU_FIXTURE_TIME}
                demo={false}
              />
            </Card>
            <span className="w-fit self-center rounded-md bg-popover px-3 py-1.5 text-body text-popover-foreground">
              Uso total da CPU: 24%
            </span>
          </section>
        ))
      )}
    </div>
  )
}

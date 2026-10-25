import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { WeatherConfig } from '@/services/system/weather.generated'
import { WeatherSettings } from './WeatherSettings'
import { weatherFixture } from './fixtures'

const meta = {
  title: 'Settings/Weather',
  component: WeatherSettings,
  args: {
    value: {
      city: weatherFixture().city,
      temperatureUnit: 'celsius',
      windUnit: 'kmh'
    },
    onChange: () => {}
  },
  render: (args) => <Controlled {...args} />
} satisfies Meta<typeof WeatherSettings>
export default meta
type Story = StoryObj<typeof meta>
function Controlled(args: React.ComponentProps<typeof WeatherSettings>) {
  const [value, setValue] = useState<WeatherConfig | undefined>(args.value)
  return <WeatherSettings value={value} onChange={setValue} />
}
export const Configured: Story = {}
export const Unconfigured: Story = { args: { value: undefined } }
export const Imperial: Story = {
  args: {
    value: {
      city: weatherFixture().city,
      temperatureUnit: 'fahrenheit',
      windUnit: 'mph'
    }
  }
}

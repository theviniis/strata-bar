import type { Meta, StoryObj } from '@storybook/react-vite'
import { WeatherPopup } from '../popup/weather.popup'
import { weatherFixture } from '../src/fixtures'

const meta = {
  title: 'Widgets/Weather/Popup',
  component: WeatherPopup,
  args: { demo: true, event: { status: 'ready', data: weatherFixture() } }
} satisfies Meta<typeof WeatherPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Day: Story = {}
export const Night: Story = {
  args: {
    event: {
      status: 'ready',
      data: { ...weatherFixture(), code: 0, isDay: false }
    }
  }
}
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Unconfigured: Story = {
  args: {
    event: { status: 'ready', data: { ...weatherFixture(), city: null } }
  }
}
export const Error: Story = {
  args: {
    event: { status: 'error', error: 'Não foi possível atualizar o clima' }
  }
}
export const Stale: Story = {
  args: {
    event: {
      status: 'ready',
      data: { ...weatherFixture(), stale: true, error: 'Sem conexão' }
    }
  }
}
export const LongCity: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...weatherFixture(),
        city: {
          ...weatherFixture().city!,
          name: 'Uma cidade com nome muito longo para verificar a quebra de linha'
        }
      }
    }
  }
}
export const MissingFields: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...weatherFixture(),
        temperature: null,
        feelsLike: null,
        humidity: null,
        code: null,
        pressure: null,
        cloud: null,
        hours: [],
        days: []
      }
    }
  }
}

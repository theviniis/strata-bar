import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import { SpotifySettings } from './SpotifySettings'
const meta = {
  tags: ['autodocs'],
  title: 'Settings/Spotify',
  component: SpotifySettings,
  args: {
    inputId: 'spotify-story',
    inputRef: null,
    clientId: '0123456789abcdef0123456789abcdef',
    status: { state: 'disconnected', clientId: '', error: null },
    error: '',
    pending: false,
    copied: false,
    native: true,
    onClientIdChange: fn(),
    onOpenDashboard: fn(),
    onCopyCallback: fn(),
    onPasteClientId: fn(),
    onConnectionChange: fn()
  }
} satisfies Meta<typeof SpotifySettings>
export default meta
type Story = StoryObj<typeof meta>
export const Disconnected: Story = {}
export const Connected: Story = {
  args: { status: { state: 'connected', clientId: '', error: null } }
}
export const Connecting: Story = {
  args: {
    status: { state: 'connecting', clientId: '', error: null },
    pending: true
  }
}
export const Demo: Story = { args: { native: false } }
export const Error: Story = { args: { error: 'Falha ao conectar Spotify' } }
export const Controlled: Story = {
  render: (args) => <ControlledSettings {...args} />
}
function ControlledSettings(
  args: React.ComponentProps<typeof SpotifySettings>
) {
  const [clientId, setClientId] = useState(args.clientId)
  const [connected, setConnected] = useState(false)
  return (
    <SpotifySettings
      {...args}
      clientId={clientId}
      onClientIdChange={setClientId}
      status={{
        state: connected ? 'connected' : 'disconnected',
        clientId,
        error: null
      }}
      onConnectionChange={setConnected}
    />
  )
}

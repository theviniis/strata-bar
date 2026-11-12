import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { VoicemeeterMidiStatus } from '../src/voicemeeter-midi-status.widget'
import type { SystemEvent, MidiDeviceStatus } from '@/services/system/bridge'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/VoicemeeterMidiStatus',
  component: VoicemeeterMidiStatus,
  args: {
    event: {
      status: 'ready',
      data: {
        status: 'connected',
        deviceName: 'WORLDE easy control',
        lastCheck: Date.now()
      }
    },
    describedBy: undefined,
    onClick: fn()
  }
} satisfies Meta<typeof VoicemeeterMidiStatus>

export default meta
type Story = StoryObj<typeof meta>

// Use the full MidiDeviceStatus union for data when status is 'ready'
type ReadyEvent = SystemEvent<MidiDeviceStatus> & { status: 'ready' }

const connectedEvent: ReadyEvent = {
  status: 'ready',
  data: {
    status: 'connected',
    deviceName: 'WORLDE easy control',
    lastCheck: Date.now()
  },
  timestamp: Date.now()
}

const disconnectedEvent: ReadyEvent = {
  status: 'ready',
  data: {
    status: 'disconnected',
    deviceName: 'WORLDE easy control',
    lastCheck: Date.now(),
    error: 'Device not found'
  },
  timestamp: Date.now()
}

const checkingEvent: ReadyEvent = {
  status: 'ready',
  data: { status: 'checking', lastCheck: Date.now() },
  timestamp: Date.now()
}

// For unavailable device, the SystemEvent status is 'ready' but data.status is 'unavailable'
const unavailableEvent: ReadyEvent = {
  status: 'ready',
  data: {
    status: 'unavailable',
    reason: 'voicemeeter_not_installed',
    message: 'Voicemeeter is not installed'
  },
  timestamp: Date.now()
}

const errorEvent: SystemEvent<null> = {
  status: 'error',
  data: null,
  error: 'MIDI API error',
  timestamp: Date.now()
}

const loadingEvent: SystemEvent<null> = {
  status: 'loading',
  data: null,
  timestamp: Date.now()
}

export const Connected: Story = {
  args: { event: connectedEvent }
}

export const Disconnected: Story = {
  args: { event: disconnectedEvent }
}

export const Checking: Story = {
  args: { event: checkingEvent }
}

export const Unavailable: Story = {
  args: { event: unavailableEvent }
}

export const Error: Story = {
  args: { event: errorEvent }
}

export const Loading: Story = {
  args: { event: loadingEvent }
}

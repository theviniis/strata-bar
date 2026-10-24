import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { AudioOutputs, type AudioOutputsProps } from './AudioOutputs'
import {
  audioOutputsFixture,
  audioLevelFixture
} from '@/features/audio/fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Popups/AudioOutputs',
  component: AudioOutputs,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    outputs: { status: 'ready', data: audioOutputsFixture() },
    volume: { status: 'ready', data: audioLevelFixture() },
    data: audioOutputsFixture(),
    pending: null,
    error: '',
    level: 64,
    muted: false,
    select: fn(),
    mute: fn(),
    setLevel: fn(),
    retry: fn()
  }
} satisfies Meta<typeof AudioOutputs>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Loading: Story = {
  args: {
    outputs: { status: 'loading' },
    volume: { status: 'loading' },
    data: null
  }
}
export const Unavailable: Story = {
  args: {
    outputs: { status: 'unavailable', data: null },
    volume: { status: 'unavailable', data: null },
    data: null
  }
}
export const Error: Story = {
  args: {
    outputs: { status: 'error', error: 'Device disconnected' },
    data: null,
    error: 'Operation failed'
  }
}
export const Pending: Story = {
  args: { pending: audioOutputsFixture().devices[1].id }
}
export const Muted: Story = { args: { muted: true } }
export const Empty: Story = {
  args: { data: { devices: [], defaultDeviceId: null } }
}
function InteractiveAudio(props: AudioOutputsProps) {
  const [data, setData] = useState(props.data)
  const [level, setLevel] = useState(props.level)
  const [muted, setMuted] = useState(props.muted)
  return (
    <AudioOutputs
      {...props}
      data={data}
      level={level}
      muted={muted}
      select={(id) =>
        setData((current) =>
          current ? { ...current, defaultDeviceId: id } : null
        )
      }
      setLevel={setLevel}
      mute={() => setMuted((current) => !current)}
    />
  )
}
export const Interactive: Story = {
  render: (args) => <InteractiveAudio {...args} />
}

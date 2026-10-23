import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { AudioInputs, type AudioInputsProps } from './AudioInputs'
import {
  audioInputsFixture,
  audioLevelFixture
} from '@/features/audio/fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Popups/AudioInputs',
  component: AudioInputs,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    inputs: { status: 'ready', data: audioInputsFixture() },
    volume: { status: 'ready', data: audioLevelFixture() },
    data: audioInputsFixture(),
    pending: null,
    error: '',
    level: 64,
    muted: false,
    select: fn(),
    mute: fn(),
    setDraft: fn(),
    setLevel: fn(),
    retry: fn()
  }
} satisfies Meta<typeof AudioInputs>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Loading: Story = {
  args: {
    inputs: { status: 'loading' },
    volume: { status: 'loading' },
    data: null
  }
}
export const Unavailable: Story = {
  args: {
    inputs: { status: 'unavailable', data: null },
    volume: { status: 'unavailable', data: null },
    data: null
  }
}
export const Error: Story = {
  args: {
    inputs: { status: 'error', error: 'Device disconnected' },
    data: null,
    error: 'Operation failed'
  }
}
export const Pending: Story = {
  args: { pending: audioInputsFixture().devices[1].id }
}
export const Muted: Story = { args: { muted: true } }
export const Empty: Story = {
  args: { data: { devices: [], defaultDeviceId: null } }
}
function InteractiveAudio(props: AudioInputsProps) {
  const [data, setData] = useState(props.data)
  const [level, setLevel] = useState(props.level)
  const [muted, setMuted] = useState(props.muted)
  return (
    <AudioInputs
      {...props}
      data={data}
      level={level}
      muted={muted}
      select={(id) =>
        setData((current) =>
          current ? { ...current, defaultDeviceId: id } : null
        )
      }
      setDraft={setLevel}
      setLevel={setLevel}
      mute={() => setMuted((current) => !current)}
    />
  )
}
export const Interactive: Story = {
  render: (args) => <InteractiveAudio {...args} />
}

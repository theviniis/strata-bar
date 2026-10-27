import type { ChannelData } from '@/services/system/bridge'
export function audioOutputsFixture(): ChannelData['audioOutputs'] {
  return {
    devices: [
      { id: 'demo-speakers', name: 'Speakers (demo)' },
      { id: 'demo-headphones', name: 'Headphones (demo)' }
    ],
    defaultDeviceId: 'demo-speakers'
  }
}
export function audioInputsFixture(): ChannelData['audioInputs'] {
  return {
    devices: [
      { id: 'demo-microphone', name: 'Microphone (demo)' },
      { id: 'demo-headset', name: 'Headset (demo)' }
    ],
    defaultDeviceId: 'demo-microphone'
  }
}
export function audioLevelFixture(): ChannelData['volume'] {
  return { level: 64, muted: false }
}

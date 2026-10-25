import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useState } from 'react'
import { AudioInspectorFields } from '@/settings/AudioInspectorFields'
import type { AudioSourceConfig } from '@/services/configuration/config'

vi.mock('@/hooks/useSystemChannel', () => ({
  useSystemChannel: () => ({
    status: 'ready',
    data: {
      strips: [{ index: 1, slot: 'Hardware 2', name: 'Microfone' }],
      buses: [{ index: 2, slot: 'A3', name: 'Alto-falantes' }]
    }
  })
}))

function Fields({ channel }: { channel: 'output' | 'input' }) {
  const [audio, setAudio] = useState<AudioSourceConfig>({
    source: 'voicemeeter',
    targetIndex: 7
  })
  return (
    <AudioInspectorFields channel={channel} audio={audio} onChange={setAudio} />
  )
}

it.each([
  ['output', 'A3 · Alto-falantes', 'Hardware 2 · Microfone'],
  ['input', 'Hardware 2 · Microfone', 'A3 · Alto-falantes']
] as const)(
  'offers only the fixed %s targets and retains an unavailable saved index',
  async (channel, included, excluded) => {
    render(<Fields channel={channel} />)
    expect(
      screen.getByRole('combobox', { name: 'Alvo Voicemeeter' })
    ).toHaveTextContent('Alvo salvo (7) indisponível')
    fireEvent.click(screen.getByRole('combobox', { name: 'Alvo Voicemeeter' }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: included })).toBeVisible()
    )
    expect(
      screen.queryByRole('option', { name: excluded })
    ).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('option', { name: included }))
    fireEvent.click(screen.getByRole('option', { name: included }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Fonte de áudio' }))
    fireEvent.pointerDown(
      await screen.findByRole('option', { name: 'Windows' })
    )
    fireEvent.click(screen.getByRole('option', { name: 'Windows' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: 'Windows' })
      ).not.toBeInTheDocument()
    )
    expect(
      screen.queryByRole('combobox', { name: 'Alvo Voicemeeter' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Fonte de áudio' }))
    const option = await screen.findByRole('option', { name: 'Voicemeeter' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)
    expect(
      await screen.findByRole('combobox', { name: 'Alvo Voicemeeter' })
    ).toHaveTextContent(included)
  }
)

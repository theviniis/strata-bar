import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DiskPopupContent } from '../features/disk/DiskPopup'
import { formatDiskBytes } from '../features/disk/presentation'
import type { DiskData, DiskVolume } from '../services/system/disk.generated'

function volume(
  mount: string,
  label: string | null,
  totalBytes: number,
  usedBytes: number,
  kind: DiskVolume['kind'] = 'fixed'
): DiskVolume {
  const freeBytes = totalBytes - usedBytes
  return {
    mount,
    label,
    kind,
    totalBytes,
    freeBytes,
    usedBytes,
    percent: (usedBytes / totalBytes) * 100
  }
}

it('lists local volumes with usage and hides network mappings', () => {
  const data: DiskData = {
    sequence: 1,
    sampledAt: 0,
    volumes: [
      volume('C:', 'System', 512_000_000_000, 225_280_000_000),
      volume(
        'Z:',
        'Compartilhamento',
        1_000_000_000_000,
        500_000_000_000,
        'remote'
      )
    ]
  }
  render(<DiskPopupContent event={{ status: 'ready', data }} />)
  expect(screen.getByText('C:')).toBeInTheDocument()
  expect(screen.getByText('System')).toBeInTheDocument()
  expect(screen.queryByText('Z:')).not.toBeInTheDocument()
  expect(
    screen.getByRole('progressbar', { name: 'Uso do disco C:' })
  ).toHaveAttribute('aria-valuenow', '44')
  expect(
    screen.getByText('209.8 GiB de 476.8 GiB · 267.0 GiB livre')
  ).toBeInTheDocument()
})

it('formats capacity in binary units', () => {
  expect(formatDiskBytes(1024)).toBe('1 KiB')
  expect(formatDiskBytes(1_073_741_824)).toBe('1.0 GiB')
  expect(formatDiskBytes(2_000_000_000_000)).toBe('1.8 TiB')
})

it('reports the loading and unavailable states', () => {
  const { rerender } = render(
    <DiskPopupContent event={{ status: 'loading' }} />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando discos')
  rerender(<DiskPopupContent event={{ status: 'error', error: 'Falha' }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Discos indisponíveis')
})

import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DiskBar } from '../features/disk/widget/disk.widget'
import { localVolumes } from '../features/disk/src/presentation'
import type { DiskVolume } from '../services/system/disk.generated'

function volume(
  mount: string,
  totalBytes: number,
  usedBytes: number,
  label: string | null = null
): DiskVolume {
  const freeBytes = totalBytes - usedBytes
  return {
    mount,
    label,
    kind: 'fixed',
    totalBytes,
    freeBytes,
    usedBytes,
    percent: (usedBytes / totalBytes) * 100
  }
}

it('renders one progress bar per volume with its rounded percentage', () => {
  render(
    <DiskBar
      compact={false}
      volumes={[
        volume('C:', 512_000_000_000, 225_280_000_000, 'System'),
        volume('D:', 1_000_000_000_000, 550_000_000_000)
      ]}
    />
  )
  expect(screen.getByText('C: 44%')).toBeInTheDocument()
  expect(screen.getByText('D: 55%')).toBeInTheDocument()
  expect(
    screen.getByRole('progressbar', { name: 'Uso do disco C:' })
  ).toHaveAttribute('aria-valuenow', '44')
  expect(
    screen.getByRole('progressbar', { name: 'Uso do disco D:' })
  ).toHaveAttribute('aria-valuenow', '55')
})

it('shows an empty placeholder when no volume is mounted', () => {
  render(<DiskBar compact={false} volumes={[]} />)
  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it('keeps local devices and drops network mappings', () => {
  const volumes = localVolumes([
    volume('C:', 100, 44),
    { ...volume('Z:', 100, 50), kind: 'remote' },
    { ...volume('Y:', 100, 50), kind: 'unknown' },
    { ...volume('E:', 100, 50), kind: 'optical' }
  ])
  expect(volumes.map((v) => v.mount)).toEqual(['C:', 'E:'])
})

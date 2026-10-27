import type { DiskData, DiskVolume } from '@/services/system/disk.generated'
export const DISK_FIXTURE_TIME = 1700000000000
export function diskFixture(at = DISK_FIXTURE_TIME): DiskData {
  const volume = (
    mount: string,
    label: string,
    totalBytes: number,
    freeBytes: number
  ): DiskVolume => ({
    mount,
    label,
    kind: 'fixed',
    totalBytes,
    freeBytes,
    usedBytes: totalBytes - freeBytes,
    percent: ((totalBytes - freeBytes) / totalBytes) * 100
  })
  return {
    sequence: 61,
    sampledAt: at,
    volumes: [
      volume('C:', 'System', 512_000_000_000, 286_720_000_000),
      volume('D:', 'Data', 1_000_000_000_000, 450_000_000_000)
    ]
  }
}

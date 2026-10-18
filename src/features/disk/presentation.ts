import type { DiskVolume } from '@/services/system/disk.generated'

const KIB = 1024
const MIB = KIB * 1024
const GIB = MIB * 1024
const TIB = GIB * 1024

/**
 * Windows reports capacity in base-1024 bytes while still labelling the result
 * "GB"; keep the binary units honest (GiB/TiB) like the memory and GPU widgets.
 */
export function formatDiskBytes(value: number) {
  if (value >= TIB) return `${(value / TIB).toFixed(1)} TiB`
  if (value >= GIB) return `${(value / GIB).toFixed(1)} GiB`
  if (value >= MIB) return `${(value / MIB).toFixed(1)} MiB`
  return `${Math.round(value / KIB)} KiB`
}

/**
 * Explorer's "Dispositivos e unidades" lists local storage only: mapped network
 * drives live under "Rede", and a letter with no root directory is not a device.
 * The native payload keeps every kind, so the choice stays in the UI.
 */
export function isLocalVolume(volume: DiskVolume) {
  return volume.kind !== 'remote' && volume.kind !== 'unknown'
}

export function localVolumes(volumes: DiskVolume[]) {
  return volumes.filter(isLocalVolume)
}

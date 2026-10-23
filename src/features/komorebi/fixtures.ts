import type { KomorebiData } from '@/services/system/bridge'

export function komorebiFixture(): KomorebiData {
  return {
    monitor: 1,
    floatOverride: false,
    workspaces: [
      {
        index: 0,
        name: 'Editor',
        status: 'populated',
        layer: 'Tiling',
        windows: 2
      },
      { index: 1, name: 'Web', status: 'active', layer: 'Tiling', windows: 1 },
      { index: 2, name: null, status: 'empty', layer: 'Floating', windows: 0 }
    ]
  }
}

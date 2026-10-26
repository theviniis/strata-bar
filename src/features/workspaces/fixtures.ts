import type { WorkspacesData } from '@/services/system/bridge'

export function workspacesFixture(): WorkspacesData {
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

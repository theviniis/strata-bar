import type { NetworkData } from '@/services/system/network.generated'

export function networkFixture(at = Date.now()): NetworkData {
  return {
    sequence: 1,
    sampledAt: at,
    selectedId: 'demo-ethernet',
    interfaces: [
      {
        id: 'demo-ethernet',
        index: 1,
        name: 'Ethernet (demonstração)',
        kind: 'Ethernet',
        connected: true,
        addresses: ['192.0.2.10'],
        gateways: ['192.0.2.1'],
        receiveLinkBps: 1_000_000_000,
        transmitLinkBps: 1_000_000_000,
        ssid: null,
        signalPercent: null,
        wifiError: null
      }
    ],
    download: 12_400_000,
    upload: 1_200_000,
    receivedBytes: 340_000_000,
    sentBytes: 21_000_000,
    observationStartedAt: at - 120_000,
    history: Array.from({ length: 61 }, (_, i) => ({
      timestamp: at - (60 - i) * 2000,
      download: (8 + 4 * Math.sin(i / 5)) * 1_000_000,
      upload: (1 + 0.5 * Math.cos(i / 4)) * 1_000_000
    })),
    quality: {
      target: '1.1.1.1',
      pingMs: 12,
      jitterMs: 2,
      lossPercent: 0,
      sent: 60,
      lost: 0,
      error: null
    },
    speedTest: {
      phase: 'idle',
      downloadMbps: null,
      uploadMbps: null,
      elapsedMs: 0,
      stageProgress: 0,
      transferredBytes: 0,
      timestamp: null,
      interfaceName: null,
      provider: 'Cloudflare',
      limited: false,
      error: null
    },
    error: null
  }
}

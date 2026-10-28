// Generated from Rust network_contract.rs by cargo build. Do not edit.
export type NetworkUnit = "bytes" | "bits";
export type NetworkConfig = { unit: NetworkUnit, probesEnabled: boolean, probeTarget: string, };
export type NetworkInterface = { id: string, index: number, name: string, kind: string, connected: boolean, addresses: Array<string>, gateways: Array<string>, receiveLinkBps: number | null, transmitLinkBps: number | null, ssid: string | null, signalPercent: number | null, wifiError: string | null, };
export type NetworkPoint = { timestamp: number, download: number | null, upload: number | null, };
export type NetworkQuality = { target: string, pingMs: number | null, jitterMs: number | null, lossPercent: number | null, sent: number, lost: number, error: string | null, };
export type NetworkTestPhase = "idle" | "preparing" | "download" | "upload" | "complete" | "cancelled" | "error";
export type NetworkSpeedTest = { phase: NetworkTestPhase, downloadMbps: number | null, uploadMbps: number | null, elapsedMs: number, transferredBytes: number, stageProgress: number, timestamp: number | null, interfaceName: string | null, provider: string, limited: boolean, error: string | null, };
export type NetworkData = { sequence: number, sampledAt: number, interfaces: Array<NetworkInterface>, selectedId: string | null, download: number | null, upload: number | null, receivedBytes: number, sentBytes: number, observationStartedAt: number | null, history: Array<NetworkPoint>, quality: NetworkQuality, speedTest: NetworkSpeedTest, error: string | null, };

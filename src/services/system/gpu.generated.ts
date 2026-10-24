// Generated from Rust gpu_contract.rs by cargo build. Do not edit.
export type GpuMetricStatus = "ready" | "error" | "unavailable";
export type GpuMetric = { status: GpuMetricStatus, value: number | null, updatedAt: number | null, error: string | null, };
export type GpuAdapter = { name: string, vendorId: number, deviceId: number, dedicatedBytes: number, };
export type GpuSensor = { provider: string, hardwareId: string, sensorId: string, name: string, };
export type GpuPoint = { sequence: number, timestamp: number, percent: number | null, temperatureCelsius: number | null, temperatureUpdatedAt: number | null, };
export type GpuData = { sequence: number, sampledAt: number, adapter: GpuAdapter | null, percent: GpuMetric, memoryUsedBytes: GpuMetric, memoryTotalBytes: GpuMetric, sharedUsedBytes: GpuMetric, sharedTotalBytes: GpuMetric, temperatureCelsius: GpuMetric, powerWatts: GpuMetric, fanPercent: GpuMetric, temperatureSensor: GpuSensor | null, history: Array<GpuPoint>, };

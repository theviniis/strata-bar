// Generated from Rust cpu_contract.rs by cargo build. Do not edit.
export type CpuMetricStatus = "ready" | "error" | "unavailable";
export type CpuMetric = { status: CpuMetricStatus, value: number | null, updatedAt: number | null, error: string | null, };
export type CpuTemperatureSensor = { provider: string, sourceId: number, instance: number, name: string, };
export type CpuPoint = { sequence: number, timestamp: number, percent: number | null, temperatureCelsius: number | null, temperatureUpdatedAt: number | null, };
export type CpuData = { sequence: number, sampledAt: number, percent: CpuMetric, frequencyHz: CpuMetric, maxFrequencyHz: CpuMetric, physicalCores: CpuMetric, logicalProcessors: CpuMetric, temperatureCelsius: CpuMetric, temperatureSensor: CpuTemperatureSensor | null, history: Array<CpuPoint>, };

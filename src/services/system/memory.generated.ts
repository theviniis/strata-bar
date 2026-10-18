// Generated from Rust memory_contract.rs by cargo build. Do not edit.
export type MemoryMetricStatus = "ready" | "error" | "unavailable" | "notConfigured";
export type MemoryMetric = { status: MemoryMetricStatus, value: number | null, updatedAt: number | null, error: string | null, };
export type MemoryPoint = { sequence: number, timestamp: number, percent: number | null, };
export type MemoryData = { sequence: number, sampledAt: number, totalBytes: MemoryMetric, availableBytes: MemoryMetric, usedBytes: MemoryMetric, cachedBytes: MemoryMetric, pagingFileBytes: MemoryMetric, percent: MemoryMetric, history: Array<MemoryPoint>, };

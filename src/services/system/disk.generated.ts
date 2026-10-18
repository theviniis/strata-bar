// Generated from Rust disk_contract.rs by cargo build. Do not edit.
export type DiskVolumeKind = "fixed" | "removable" | "optical" | "ramdisk" | "remote" | "unknown";
export type DiskVolume = { 
/**
 * Drive root as Windows reports it, without the trailing separator
 * (for example `C:`).
 */
mount: string, 
/**
 * Volume label; `None` when the volume is unnamed.
 */
label: string | null, kind: DiskVolumeKind, totalBytes: number, freeBytes: number, usedBytes: number, percent: number, };
export type DiskData = { sequence: number, sampledAt: number, volumes: Array<DiskVolume>, };

// Generated from Rust config_contract.rs by cargo build. Do not edit.
export type WidgetKind = "clock" | "reminders" | "agents" | "cpu" | "memory" | "gpu" | "disk" | "network" | "music" | "volume" | "microphone" | "activeWindow" | "komorebi";
export type AudioTargetKind = "strip" | "bus";
export type AudioTarget = { kind: AudioTargetKind, index: number, };
export type AudioSource = "windows" | "voicemeeter";
export type WidgetAudio = { source: AudioSource, target?: AudioTarget | null, label?: string | null, enabled?: boolean | null, };
export type WidgetFormat = "compact" | "label";
export type WidgetConfig = { id: string, type: WidgetKind, enabled: boolean, intervalMs: number, format: WidgetFormat, tooltip: boolean, audio?: WidgetAudio | null, };
export type BarPosition = "top" | "bottom";
export type BarTheme = "dark" | "light";
export type BarConfig = { position: BarPosition, height: number, spacing: number, theme: BarTheme, alwaysOnTop: boolean, };
export type BarOverride = { position?: BarPosition | null, height?: number | null, spacing?: number | null, theme?: BarTheme | null, alwaysOnTop?: boolean | null, };
export type WidgetSections = { left: Array<WidgetConfig>, center: Array<WidgetConfig>, right: Array<WidgetConfig>, };
export type AgentVisibility = { chatgpt: boolean, opencode: boolean, antigravity: boolean, codex: boolean, };
export type AgentsConfig = { visible: AgentVisibility, };
export type Config = { 
/**
 * Pointer to the published JSON Schema, so a hand-edited document gets
 * editor completion and inline range errors. Optional and optional to
 * serialize: documents written before it existed stay valid, and a save
 * preserves whatever the author put there.
 */
$schema?: string | null, version: number, agents: AgentsConfig, bar: BarConfig, widgets: WidgetSections, monitors: { [key in string]?: BarOverride }, };
export type ConfigSnapshot = { revision: number, config: Config, error: string | null, };

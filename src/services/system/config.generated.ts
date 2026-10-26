// Generated from Rust config_contract.rs by cargo build. Do not edit.
import type { WeatherConfig } from './weather.generated'
export type WidgetKind = "separator" | "clock" | "weather" | "reminders" | "agents" | "cpu" | "memory" | "gpu" | "disk" | "network" | "music" | "mediaSpectrum" | "volume" | "microphone" | "activeWindow" | "workspaces";
export type AudioSource = "windows" | "voicemeeter";
export type AudioChannelConfig = { source: AudioSource, targetIndex: number, };
export type AudioConfig = { output: AudioChannelConfig, input: AudioChannelConfig, };
export type WidgetFormat = "compact" | "label";
export type WorkspaceSource = "komorebi" | "windows";
export type WidgetConfig = { workspaceSource?: WorkspaceSource | null, id: string, type: WidgetKind, enabled: boolean, intervalMs: number, format: WidgetFormat, tooltip: boolean, marginX?: number | null, };
export type BarPosition = "top" | "bottom";
export type BarTheme = "system" | "dark" | "light";
export type ColorTheme = "current" | "amoled" | "nord" | "dracula" | "catppuccin";
export type BarConfig = { enabled: boolean, position: BarPosition, height: number, cornerRadius?: number | null, spacing: number, separatorMarginX?: number | null, theme: BarTheme, colorTheme: ColorTheme, };
export type WidgetOverride = { workspaceSource?: WorkspaceSource | null, enabled?: boolean | null, intervalMs?: number | null, format?: WidgetFormat | null, tooltip?: boolean | null, marginX?: number | null, };
export type BarOverride = { enabled?: boolean | null, layout?: WidgetLayout | null, widgets?: { [key in string]?: WidgetOverride } | null, position?: BarPosition | null, height?: number | null, cornerRadius?: number | null, spacing?: number | null, theme?: BarTheme | null, colorTheme?: ColorTheme | null, };
export type WidgetSections = { left: Array<WidgetConfig>, center: Array<WidgetConfig>, right: Array<WidgetConfig>, };
export type WidgetLayout = { left: Array<string>, center: Array<string>, right: Array<string>, };
export type SettingsMonitor = { id: string, deviceName: string, name: string, width: number, height: number, primary: boolean, };
export type AgentVisibility = { chatgpt: boolean, opencode: boolean, antigravity: boolean, codex: boolean, };
export type AgentsConfig = { visible: AgentVisibility, };
export type Config = { 
/**
 * Pointer to the published JSON Schema, so a hand-edited document gets
 * editor completion and inline range errors. Optional and optional to
 * serialize: documents written before it existed stay valid, and a save
 * preserves whatever the author put there.
 */
$schema?: string | null, version: number, audio: AudioConfig, weather?: WeatherConfig | null, agents: AgentsConfig, bar: BarConfig, widgets: WidgetSections, layout?: WidgetLayout | null, monitors: { [key in string]?: BarOverride }, };
export type ConfigSnapshot = { revision: number, config: Config, error: string | null, };

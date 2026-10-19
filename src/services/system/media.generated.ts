// Generated from Rust media_contract.rs by cargo build. Do not edit.
export type MediaAvailability = "ready" | "unsupported" | "unauthenticated" | "unavailable" | "error";
export type MediaValue<T> = { status: MediaAvailability, value: T | null, reason: string | null, };
export type MediaProgress = { positionMs: number, durationMs: number, minSeekMs: number, maxSeekMs: number, rate: number, measuredAt: number, };
export type PlayerVolume = { level: number, muted: boolean, source: string, };
export type MediaCapabilities = { previous: boolean, playPause: boolean, next: boolean, seek: boolean, volume: boolean, mute: boolean, favorite: boolean, openPlayer: boolean, };
export type MediaData = { sessionId: string, trackId: string, playerId: string, playerName: string, title: string, artist: string, album: string, artwork: MediaValue<string>, playback: string, progress: MediaValue<MediaProgress>, volume: MediaValue<PlayerVolume>, favorite: MediaValue<boolean>, spotifyUri: string | null, capabilities: MediaCapabilities, };
export type MediaAction = { "action": "openPlayer" } | { "action": "previous" } | { "action": "playPause" } | { "action": "next" } | { "action": "seek", positionMs: number, } | { "action": "volume", level: number, } | { "action": "mute", muted: boolean, } | { "action": "favorite", saved: boolean, };
export type MediaRequest = { sessionId: string, trackId: string, action: MediaAction, };
export type SpotifyStatus = { state: string, clientId: string, error: string | null, };

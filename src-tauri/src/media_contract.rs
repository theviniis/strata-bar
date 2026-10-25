use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Only frequency energies cross IPC; PCM never leaves the capture worker.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MediaSpectrumData {
    pub session_id: String,
    pub generation: u32,
    pub sequence: u32,
    pub bands: [f32; 6],
}

#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MediaAvailability {
    Ready,
    Unsupported,
    Unauthenticated,
    Unavailable,
    Error,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MediaValue<T: TS> {
    pub status: MediaAvailability,
    pub value: Option<T>,
    pub reason: Option<String>,
}
impl<T: TS> MediaValue<T> {
    pub fn ready(value: T) -> Self {
        Self {
            status: MediaAvailability::Ready,
            value: Some(value),
            reason: None,
        }
    }
    pub fn absent(status: MediaAvailability, reason: &str) -> Self {
        // The TypeScript contract reads `ready` as "value is present"; an absent
        // value with a ready status invalidates the whole payload.
        debug_assert_ne!(
            status,
            MediaAvailability::Ready,
            "a ready value cannot be absent"
        );
        Self {
            status,
            value: None,
            reason: Some(reason.into()),
        }
    }
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MediaProgress {
    pub position_ms: f64,
    pub duration_ms: f64,
    pub min_seek_ms: f64,
    pub max_seek_ms: f64,
    pub rate: f64,
    pub measured_at: f64,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PlayerVolume {
    pub level: f32,
    pub muted: bool,
    pub source: String,
}
/// Playback repeat mode as reported by the player, mirroring the GSMTC
/// `MediaPlaybackAutoRepeatMode` values without inventing intermediate states.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMode {
    None,
    Track,
    List,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    pub previous: bool,
    pub play_pause: bool,
    pub next: bool,
    pub seek: bool,
    pub volume: bool,
    pub mute: bool,
    pub shuffle: bool,
    pub repeat: bool,
    pub favorite: bool,
    pub open_player: bool,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MediaData {
    pub session_id: String,
    pub track_id: String,
    pub player_id: String,
    pub player_name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: MediaValue<String>,
    pub playback: String,
    pub progress: MediaValue<MediaProgress>,
    pub volume: MediaValue<PlayerVolume>,
    pub shuffle: MediaValue<bool>,
    pub repeat: MediaValue<RepeatMode>,
    pub favorite: MediaValue<bool>,
    pub spotify_uri: Option<String>,
    pub capabilities: MediaCapabilities,
}
#[derive(Clone, Debug, Deserialize, TS)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum MediaAction {
    OpenPlayer,
    Previous,
    PlayPause,
    Next,
    #[serde(rename_all = "camelCase")]
    Seek {
        position_ms: f64,
    },
    Volume {
        level: f32,
    },
    Mute {
        muted: bool,
    },
    Shuffle {
        active: bool,
    },
    Repeat {
        mode: RepeatMode,
    },
    Favorite {
        saved: bool,
    },
}
#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaRequest {
    pub session_id: String,
    pub track_id: String,
    pub action: MediaAction,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatus {
    pub state: String,
    pub client_id: String,
    pub error: Option<String>,
}

#[cfg(test)]
pub fn fixture() -> MediaData {
    MediaData {
        session_id: "session-1".into(),
        track_id: "track-1".into(),
        player_id: "Spotify.exe".into(),
        player_name: "Spotify".into(),
        title: "Dragonaut".into(),
        artist: "Sleep".into(),
        album: "Holy Mountain".into(),
        playback: "playing".into(),
        artwork: MediaValue::absent(MediaAvailability::Unavailable, "No image"),
        progress: MediaValue::ready(MediaProgress {
            position_ms: 32000.,
            duration_ms: 343000.,
            min_seek_ms: 0.,
            max_seek_ms: 343000.,
            rate: 1.,
            measured_at: crate::metrics::timestamp() as f64,
        }),
        volume: MediaValue::ready(PlayerVolume {
            level: 64.,
            muted: false,
            source: "applicationSession".into(),
        }),
        shuffle: MediaValue::ready(false),
        repeat: MediaValue::ready(RepeatMode::None),
        favorite: MediaValue::absent(MediaAvailability::Unauthenticated, "Connect Spotify"),
        spotify_uri: None,
        capabilities: MediaCapabilities {
            previous: true,
            play_pause: true,
            next: true,
            seek: true,
            volume: true,
            mute: true,
            shuffle: true,
            repeat: true,
            favorite: false,
            open_player: false,
        },
    }
}

use windows_future::{AsyncStatus, IAsyncInfo, IAsyncOperation};
// WinRT media sessions and per-application Core Audio. All handles stay native.
use crate::media_contract::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::Sender,
        Arc,
    },
    time::{Duration, Instant},
};
use windows::{
    core::{implement, Interface, BOOL, GUID, HSTRING, PCWSTR, PWSTR},
    ApplicationModel::AppInfo,
    Foundation::{IReference, TypedEventHandler},
    Media::{Control::*, MediaPlaybackAutoRepeatMode},
    Storage::Streams::{DataReader, IRandomAccessStreamWithContentType},
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        Media::Audio::*,
        Storage::Packaging::Appx::GetApplicationUserModelId,
        System::{Com::*, Diagnostics::ToolHelp::*, Threading::*},
        UI::WindowsAndMessaging::*,
    },
};

fn wait<T>(
    info: &IAsyncInfo,
    result: impl FnOnce() -> windows::core::Result<T>,
) -> windows::core::Result<T> {
    let until = Instant::now() + Duration::from_secs(3);
    while info.Status()? == AsyncStatus::Started {
        if Instant::now() >= until {
            let _ = info.Cancel();
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x800705B4u32 as i32),
                "Media operation timed out",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    result()
}
macro_rules! complete {
    ($operation:expr) => {{
        let operation = $operation?;
        wait(&operation.cast::<IAsyncInfo>()?, || operation.GetResults())
    }};
}
fn poll_result<T>(
    info: &IAsyncInfo,
    result: impl FnOnce() -> windows::core::Result<T>,
    deadline: Instant,
) -> windows::core::Result<Option<T>> {
    if info.Status()? == AsyncStatus::Started {
        if Instant::now() >= deadline {
            let _ = info.Cancel();
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x800705B4u32 as i32),
                "Media operation timed out",
            ));
        }
        return Ok(None);
    }
    result().map(Some)
}
struct Pending<T: windows::core::RuntimeType + 'static> {
    operation: IAsyncOperation<T>,
    info: IAsyncInfo,
    deadline: Instant,
}
impl<T: windows::core::RuntimeType + 'static> Pending<T> {
    fn new(operation: IAsyncOperation<T>) -> windows::core::Result<Self> {
        Ok(Self {
            info: operation.cast()?,
            operation,
            deadline: Instant::now() + Duration::from_secs(3),
        })
    }
    fn poll(&self) -> windows::core::Result<Option<T>> {
        poll_result(&self.info, || self.operation.GetResults(), self.deadline)
    }
}
impl<T: windows::core::RuntimeType + 'static> Drop for Pending<T> {
    fn drop(&mut self) {
        if self
            .info
            .Status()
            .is_ok_and(|status| status == AsyncStatus::Started)
        {
            let _ = self.info.Cancel();
        }
    }
}

pub struct WindowsMedia {
    manager: GlobalSystemMediaTransportControlsSessionManager,
    manager_tokens: Vec<(bool, i64)>,
    session: Option<GlobalSystemMediaTransportControlsSession>,
    session_tokens: Vec<(u8, i64)>,
    revision: Arc<AtomicU64>,
    seen: u64,
    serial: u64,
    cached: Option<MediaData>,
    metadata: Option<(
        u64,
        Pending<GlobalSystemMediaTransportControlsSessionMediaProperties>,
    )>,
    artwork: Option<ArtworkRead>,
    tx: Sender<crate::media::Request>,
    audio: Option<PlayerAudio>,
    audio_source: String,
    audio_dirty: Arc<AtomicBool>,
    discovery: Option<AudioDiscovery>,
}
static SESSION_SERIAL: AtomicU64 = AtomicU64::new(0);
impl WindowsMedia {
    pub fn new(tx: Sender<crate::media::Request>) -> windows::core::Result<Self> {
        let manager = complete!(GlobalSystemMediaTransportControlsSessionManager::RequestAsync())?;
        let mut this = Self {
            manager,
            manager_tokens: vec![],
            session: None,
            session_tokens: vec![],
            revision: Arc::new(AtomicU64::new(1)),
            seen: 0,
            serial: 0,
            cached: None,
            metadata: None,
            artwork: None,
            tx,
            audio: None,
            audio_source: String::new(),
            audio_dirty: Arc::new(AtomicBool::new(true)),
            discovery: None,
        };
        let tx = this.tx.clone();
        let token = this
            .manager
            .CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(crate::media::Request::Wake);
                Ok(())
            }))?;
        this.manager_tokens.push((true, token));
        let tx = this.tx.clone();
        let token = this
            .manager
            .SessionsChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(crate::media::Request::Wake);
                Ok(())
            }))?;
        this.manager_tokens.push((false, token));
        Ok(this)
    }
    fn clear_session(&mut self) {
        self.metadata = None;
        self.artwork = None;
        self.audio = None;
        if let Some(session) = self.session.take() {
            for (kind, token) in self.session_tokens.drain(..) {
                let _ = match kind {
                    0 => session.RemoveMediaPropertiesChanged(token),
                    1 => session.RemovePlaybackInfoChanged(token),
                    _ => session.RemoveTimelinePropertiesChanged(token),
                };
            }
        }
        self.cached = None;
    }
    fn reconcile(&mut self) -> windows::core::Result<()> {
        let current = self.manager.GetCurrentSession().ok();
        if current == self.session {
            return Ok(());
        }
        self.clear_session();
        self.serial = SESSION_SERIAL.fetch_add(1, Ordering::SeqCst) + 1;
        self.revision.fetch_add(1, Ordering::SeqCst);
        self.session = current;
        if let Some(s) = self.session.as_ref() {
            let tx = self.tx.clone();
            let revision = self.revision.clone();
            let token = s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                revision.fetch_add(1, Ordering::SeqCst);
                let _ = tx.send(crate::media::Request::Wake);
                Ok(())
            }))?;
            self.session_tokens.push((0, token));
            let tx = self.tx.clone();
            let token = s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(crate::media::Request::Wake);
                Ok(())
            }))?;
            self.session_tokens.push((1, token));
            let tx = self.tx.clone();
            let token = s.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(crate::media::Request::Wake);
                Ok(())
            }))?;
            self.session_tokens.push((2, token));
        }
        Ok(())
    }
    pub fn snapshot(&self) -> Option<MediaData> {
        self.cached.clone()
    }
    pub fn has_pending_read(&self) -> bool {
        self.metadata.is_some()
            || self.artwork.is_some()
            || (self.session.is_some() && self.revision.load(Ordering::SeqCst) != self.seen)
    }
    /// Blocking diagnostics only. The interactive worker always uses `read`.
    pub fn read_settled(&mut self) -> windows::core::Result<Option<MediaData>> {
        let deadline = Instant::now() + Duration::from_secs(9);
        loop {
            let data = self.read()?;
            if !self.has_pending_read() {
                return Ok(data);
            }
            if Instant::now() >= deadline {
                return Err(windows::core::Error::new(
                    windows::core::HRESULT(0x800705B4u32 as i32),
                    "Media did not settle",
                ));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    pub fn action_snapshot(&self) -> Result<MediaData, String> {
        let session = self.session.as_ref().ok_or("Media session closed")?;
        if self.manager.GetCurrentSession().ok().as_ref() != Some(session)
            || self.revision.load(Ordering::SeqCst) != self.seen
        {
            return Err("Media session or track changed".into());
        }
        self.cached
            .clone()
            .ok_or("No current media snapshot".into())
    }
    pub fn read(&mut self) -> windows::core::Result<Option<MediaData>> {
        self.reconcile()?;
        let Some(session) = self.session.as_ref() else {
            return Ok(None);
        };
        if self.cached.is_none() || self.revision.load(Ordering::SeqCst) != self.seen {
            self.artwork = None;
            if self
                .metadata
                .as_ref()
                .is_some_and(|(revision, _)| *revision != self.revision.load(Ordering::SeqCst))
            {
                self.metadata = None;
            }
            if self.metadata.is_none() {
                self.metadata = Some((
                    self.revision.load(Ordering::SeqCst),
                    Pending::new(session.TryGetMediaPropertiesAsync()?)?,
                ));
            }
            let pending = self.metadata.as_ref().unwrap();
            let revision = pending.0;
            let polled = pending.1.poll();
            let properties = match polled {
                Ok(Some(properties)) => {
                    self.metadata = None;
                    properties
                }
                Ok(None) => return Ok(self.cached.clone()),
                Err(error) => {
                    self.metadata = None;
                    return Err(error);
                }
            };
            // A burst can supersede an in-flight read. Discard it, then start
            // the newest revision on the next pass; never spin here.
            if revision != self.revision.load(Ordering::SeqCst)
                || self.manager.GetCurrentSession().ok().as_ref() != Some(session)
            {
                return Ok(self.cached.clone());
            }
            let player_id = session.SourceAppUserModelId()?.to_string();
            let player_name = AppInfo::GetFromAppUserModelId(&HSTRING::from(&player_id))
                .and_then(|a| a.DisplayInfo())
                .and_then(|d| d.DisplayName())
                .map(|n| n.to_string())
                .unwrap_or_else(|_| player_id.trim_end_matches(".exe").to_string());
            self.artwork = ArtworkRead::new(&properties).ok();
            let title = properties.Title()?.to_string();
            let artist = properties.Artist()?.to_string();
            let album = properties.AlbumTitle()?.to_string();
            // A metadata notification can update artwork or repeat the same
            // fields. Its revision guards read races, but is not a new track.
            // Preserve identity so the UI and Spotify correlation stay intact.
            let track_id = self
                .cached
                .as_ref()
                .filter(|old| {
                    old.player_id == player_id
                        && old.title == title
                        && old.artist == artist
                        && old.album == album
                })
                .map(|old| old.track_id.clone())
                .unwrap_or_else(|| format!("track-{}-{revision}", self.serial));
            // Resolving the player window walks every process and top-level
            // window, so sample it once per metadata read instead of on every
            // timeline tick that only refreshes playing state.
            let open_player = player_window(&player_id).is_some();
            let artwork = self
                .cached
                .as_ref()
                .filter(|old| old.track_id == track_id)
                .map(|old| old.artwork.clone())
                .unwrap_or_else(missing_artwork);
            self.cached = Some(MediaData {
                session_id: format!("session-{}", self.serial),
                track_id,
                player_id,
                player_name,
                title,
                artist,
                album,
                artwork,
                playback: "unknown".into(),
                progress: MediaValue::absent(MediaAvailability::Unavailable, "No timeline"),
                volume: MediaValue::absent(
                    MediaAvailability::Unavailable,
                    "No unambiguous application audio session",
                ),
                shuffle: MediaValue::absent(
                    MediaAvailability::Unavailable,
                    "No playback mode information yet",
                ),
                repeat: MediaValue::absent(
                    MediaAvailability::Unavailable,
                    "No playback mode information yet",
                ),
                favorite: MediaValue::absent(
                    MediaAvailability::Unsupported,
                    "Favorites require a Spotify session",
                ),
                spotify_uri: None,
                capabilities: MediaCapabilities {
                    previous: false,
                    play_pause: false,
                    next: false,
                    seek: false,
                    volume: false,
                    mute: false,
                    shuffle: false,
                    repeat: false,
                    favorite: false,
                    open_player,
                },
            });
            self.seen = revision;
        }
        // Consume audio notifications only once this pass can resolve audio.
        // A pending metadata read must not swallow a device/session change.
        let audio_changed = self.audio_dirty.swap(false, Ordering::SeqCst);
        if self.discovery.is_none() {
            self.discovery =
                unsafe { AudioDiscovery::new(self.tx.clone(), self.audio_dirty.clone()).ok() };
        } else if audio_changed {
            if let Some(discovery) = &mut self.discovery {
                let _ = unsafe { discovery.reconcile() };
            }
        }
        if let Some(artwork) = self.artwork.as_mut() {
            match artwork.poll() {
                Ok(Some(value)) => {
                    self.cached.as_mut().unwrap().artwork = value;
                    self.artwork = None;
                }
                Ok(None) => {}
                Err(_) => {
                    self.artwork = None;
                }
            }
        }
        let data = self.cached.as_mut().unwrap();
        let playback = session.GetPlaybackInfo()?;
        let status = playback.PlaybackStatus()?;
        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
            self.metadata = None;
            self.artwork = None;
            self.seen = self.revision.load(Ordering::SeqCst);
            self.cached = None;
            return Ok(None);
        }
        data.playback = match status {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => "playing",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "paused",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => "stopped",
            _ => "unknown",
        }
        .into();
        let controls = playback.Controls()?;
        data.capabilities.previous = controls.IsPreviousEnabled().unwrap_or(false);
        data.capabilities.next = controls.IsNextEnabled().unwrap_or(false);
        data.capabilities.play_pause = if data.playback == "playing" {
            controls.IsPauseEnabled().unwrap_or(false)
        } else {
            controls.IsPlayEnabled().unwrap_or(false)
        };
        // Shuffle and repeat are optional GSMTC playback properties. A player
        // that reports no state keeps the capability off and the UI disables
        // the control instead of inventing a value.
        data.shuffle = playback_flag(playback.IsShuffleActive(), "Player does not expose shuffle");
        data.repeat = playback_repeat(playback.AutoRepeatMode(), "Player does not expose repeat");
        data.capabilities.shuffle = data.shuffle.status == MediaAvailability::Ready;
        data.capabilities.repeat = data.repeat.status == MediaAvailability::Ready;
        data.progress = match session.GetTimelineProperties() {
            Ok(t) => timeline(&t, &playback),
            Err(_) => MediaValue::absent(MediaAvailability::Error, "Cannot read media timeline"),
        };
        data.capabilities.seek = controls.IsPlaybackPositionEnabled().unwrap_or(false)
            && data
                .progress
                .value
                .as_ref()
                .is_some_and(|p| p.max_seek_ms > p.min_seek_ms);
        // Resolving a session enumerates every render endpoint and process, so
        // reuse the matched session until Core Audio reports a change. Ambiguity
        // still disables volume: a new session sets the dirty flag and forces a
        // fresh resolution.
        let expired = self.audio.as_ref().is_some_and(|audio| unsafe {
            audio
                .control
                .GetState()
                .map_or(true, |state| state == AudioSessionStateExpired)
        });
        let mut audio_error = None;
        if audio_resolution_needed(
            self.audio.is_some(),
            audio_changed,
            expired,
            self.audio_source != data.player_id,
        ) {
            self.audio_source = data.player_id.clone();
            let next = unsafe {
                find_audio(
                    &data.player_id,
                    self.audio.as_ref().map(|a| a.id.as_str()),
                    self.tx.clone(),
                    self.audio_dirty.clone(),
                )
            };
            match next {
                Ok(Some(audio)) => self.audio = Some(audio),
                Ok(None) => self.audio = None,
                Err(error) => {
                    self.audio = None;
                    audio_error = Some(error.to_string());
                }
            }
        }
        data.volume = if let Some(error) = audio_error {
            MediaValue::absent(MediaAvailability::Error, &error)
        } else {
            self.audio
                .as_ref()
                .map(|a| unsafe { a.read() })
                .unwrap_or_else(|| {
                    MediaValue::absent(
                        MediaAvailability::Unavailable,
                        "No unambiguous application audio session",
                    )
                })
        };
        data.capabilities.volume = data.volume.status == MediaAvailability::Ready;
        data.capabilities.mute = data.capabilities.volume;
        // Enrichment is regenerated by the Spotify service, never retained across reads.
        data.spotify_uri = None;
        data.capabilities.favorite = false;
        data.favorite = MediaValue::absent(
            if crate::spotify::is_spotify(&data.player_id) {
                MediaAvailability::Unavailable
            } else {
                MediaAvailability::Unsupported
            },
            "Spotify account enrichment is separate from native media reads",
        );
        Ok(Some(data.clone()))
    }
    pub fn act(&mut self, action: &MediaAction, data: &MediaData) -> Result<(), String> {
        // Validate against the native event revision and cached identity. A
        // control must not wait for another async metadata/artwork round-trip.
        let current = self.action_snapshot()?;
        if current.session_id != data.session_id || current.track_id != data.track_id {
            return Err("Media track changed".into());
        }
        let session = self.session.as_ref().ok_or("Media session closed")?;
        let result = (|| -> windows::core::Result<bool> {
            Ok(match action {
                MediaAction::OpenPlayer => {
                    focus_player(&data.player_id)?;
                    true
                }
                MediaAction::Previous => complete!(session.TrySkipPreviousAsync())?,
                MediaAction::Next => complete!(session.TrySkipNextAsync())?,
                MediaAction::PlayPause => {
                    if data.playback == "playing" {
                        complete!(session.TryPauseAsync())?
                    } else {
                        complete!(session.TryPlayAsync())?
                    }
                }
                MediaAction::Seek { position_ms } => complete!(session
                    .TryChangePlaybackPositionAsync(
                        (*position_ms * 10000.) as i64
                            + session.GetTimelineProperties()?.StartTime()?.Duration
                    ))?,
                MediaAction::Volume { level } => {
                    unsafe {
                        self.audio
                            .as_ref()
                            .ok_or_else(windows::core::Error::from_thread)?
                            .volume
                            .SetMasterVolume(*level / 100., std::ptr::null())?;
                    }
                    true
                }
                MediaAction::Mute { muted } => {
                    unsafe {
                        self.audio
                            .as_ref()
                            .ok_or_else(windows::core::Error::from_thread)?
                            .volume
                            .SetMute(*muted, std::ptr::null())?;
                    }
                    true
                }
                MediaAction::Shuffle { active } => {
                    complete!(session.TryChangeShuffleActiveAsync(*active))?
                }
                MediaAction::Repeat { mode } => {
                    complete!(session.TryChangeAutoRepeatModeAsync(auto_repeat(*mode)))?
                }
                MediaAction::Favorite { .. } => false,
            })
        })();
        match result {
            Ok(true) => Ok(()),
            Ok(false) => Err("Player rejected the media action".into()),
            Err(e) => Err(e.to_string()),
        }
    }
}
impl Drop for WindowsMedia {
    fn drop(&mut self) {
        self.clear_session();
        for (current, token) in self.manager_tokens.drain(..) {
            let _ = if current {
                self.manager.RemoveCurrentSessionChanged(token)
            } else {
                self.manager.RemoveSessionsChanged(token)
            };
        }
    }
}

/// A missing GSMTC `IReference` means the player never reports that property.
fn playback_flag(value: windows::core::Result<IReference<bool>>, reason: &str) -> MediaValue<bool> {
    match value.and_then(|flag| flag.Value()) {
        Ok(value) => MediaValue::ready(value),
        Err(_) => MediaValue::absent(MediaAvailability::Unsupported, reason),
    }
}
fn playback_repeat(
    value: windows::core::Result<IReference<MediaPlaybackAutoRepeatMode>>,
    reason: &str,
) -> MediaValue<RepeatMode> {
    match value
        .and_then(|mode| mode.Value())
        .ok()
        .and_then(repeat_mode)
    {
        Some(mode) => MediaValue::ready(mode),
        None => MediaValue::absent(MediaAvailability::Unsupported, reason),
    }
}
fn repeat_mode(value: MediaPlaybackAutoRepeatMode) -> Option<RepeatMode> {
    if value == MediaPlaybackAutoRepeatMode::None {
        Some(RepeatMode::None)
    } else if value == MediaPlaybackAutoRepeatMode::Track {
        Some(RepeatMode::Track)
    } else if value == MediaPlaybackAutoRepeatMode::List {
        Some(RepeatMode::List)
    } else {
        None
    }
}
fn auto_repeat(mode: RepeatMode) -> MediaPlaybackAutoRepeatMode {
    match mode {
        RepeatMode::None => MediaPlaybackAutoRepeatMode::None,
        RepeatMode::Track => MediaPlaybackAutoRepeatMode::Track,
        RepeatMode::List => MediaPlaybackAutoRepeatMode::List,
    }
}
fn timeline(
    t: &GlobalSystemMediaTransportControlsSessionTimelineProperties,
    playback: &GlobalSystemMediaTransportControlsSessionPlaybackInfo,
) -> MediaValue<MediaProgress> {
    let result = (|| -> windows::core::Result<MediaProgress> {
        let start = t.StartTime()?.Duration as f64 / 10000.;
        let end = t.EndTime()?.Duration as f64 / 10000.;
        let duration = (end - start).max(0.);
        let position = (t.Position()?.Duration as f64 / 10000. - start).clamp(0., duration);
        let playing = playback.PlaybackStatus()?
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
        let rate = if playing {
            playback
                .PlaybackRate()
                .and_then(|r| r.Value())
                .unwrap_or(1.)
        } else {
            0.
        };
        let measured = t.LastUpdatedTime()?.UniversalTime as f64 / 10000. - 11644473600000.;
        let now = crate::metrics::timestamp() as f64;
        Ok(MediaProgress {
            position_ms: position,
            duration_ms: duration,
            min_seek_ms: (t.MinSeekTime()?.Duration as f64 / 10000. - start).clamp(0., duration),
            max_seek_ms: (t.MaxSeekTime()?.Duration as f64 / 10000. - start).clamp(0., duration),
            rate: if rate.is_finite() { rate } else { 0. },
            measured_at: if measured > 0. && measured <= now {
                measured
            } else {
                now
            },
        })
    })();
    match result {
        Ok(p) if p.duration_ms > 0. => MediaValue::ready(p),
        _ => MediaValue::absent(
            MediaAvailability::Unavailable,
            "Player does not expose a finite timeline",
        ),
    }
}
enum ArtworkRead {
    Opening(Pending<IRandomAccessStreamWithContentType>),
    Loading {
        reader: DataReader,
        pending: Pending<u32>,
    },
}
impl ArtworkRead {
    fn new(
        properties: &GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> windows::core::Result<Self> {
        Ok(Self::Opening(Pending::new(
            properties.Thumbnail()?.OpenReadAsync()?,
        )?))
    }
    fn poll(&mut self) -> windows::core::Result<Option<MediaValue<String>>> {
        match self {
            Self::Opening(pending) => {
                let Some(stream) = pending.poll()? else {
                    return Ok(None);
                };
                let size = stream.Size()?;
                if size == 0 || size > 5 * 1024 * 1024 {
                    return Ok(Some(missing_artwork()));
                }
                let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
                let pending = Pending::new(reader.LoadAsync(size as u32)?)?;
                *self = Self::Loading { reader, pending };
                Ok(None)
            }
            Self::Loading { reader, pending } => {
                let Some(loaded) = pending.poll()? else {
                    return Ok(None);
                };
                let mut bytes = vec![0; loaded as usize];
                reader.ReadBytes(&mut bytes)?;
                Ok(Some(decode_artwork(&bytes)))
            }
        }
    }
}
fn decode_artwork(bytes: &[u8]) -> MediaValue<String> {
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return missing_artwork();
    };
    MediaValue::ready(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
fn missing_artwork() -> MediaValue<String> {
    MediaValue::absent(
        MediaAvailability::Unavailable,
        "Artwork missing, invalid or larger than 5 MiB",
    )
}

struct PlayerAudio {
    id: String,
    control: IAudioSessionControl,
    volume: ISimpleAudioVolume,
    events: IAudioSessionEvents,
}

struct AudioDiscovery {
    enumerator: IMMDeviceEnumerator,
    device_events: IMMNotificationClient,
    sessions: Vec<(String, IAudioSessionManager2, IAudioSessionNotification)>,
    tx: Sender<crate::media::Request>,
    dirty: Arc<AtomicBool>,
}
impl AudioDiscovery {
    unsafe fn new(
        tx: Sender<crate::media::Request>,
        dirty: Arc<AtomicBool>,
    ) -> windows::core::Result<Self> {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device_events: IMMNotificationClient = DeviceEvents {
            tx: tx.clone(),
            dirty: dirty.clone(),
        }
        .into();
        enumerator.RegisterEndpointNotificationCallback(&device_events)?;
        let mut this = Self {
            enumerator,
            device_events,
            sessions: vec![],
            tx,
            dirty,
        };
        this.reconcile()?;
        Ok(this)
    }
    unsafe fn reconcile(&mut self) -> windows::core::Result<()> {
        let devices = self
            .enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let mut ids = vec![];
        for index in 0..devices.GetCount()? {
            let device = devices.Item(index)?;
            let raw = device.GetId()?;
            let id = raw.to_string();
            CoTaskMemFree(Some(raw.0.cast()));
            let id = id?;
            ids.push(id.clone());
            if self.sessions.iter().any(|(old, _, _)| old == &id) {
                continue;
            }
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            // Core Audio requires initial enumeration before session notifications.
            let _ = manager.GetSessionEnumerator()?.GetCount()?;
            let events: IAudioSessionNotification = SessionEvents {
                tx: self.tx.clone(),
                dirty: self.dirty.clone(),
            }
            .into();
            manager.RegisterSessionNotification(&events)?;
            self.sessions.push((id, manager, events));
        }
        self.sessions.retain(|(id, manager, events)| {
            if ids.contains(id) {
                true
            } else {
                let _ = manager.UnregisterSessionNotification(events);
                false
            }
        });
        Ok(())
    }
}
impl Drop for AudioDiscovery {
    fn drop(&mut self) {
        unsafe {
            for (_, manager, events) in self.sessions.drain(..) {
                let _ = manager.UnregisterSessionNotification(&events);
            }
            let _ = self
                .enumerator
                .UnregisterEndpointNotificationCallback(&self.device_events);
        }
    }
}
#[implement(IAudioSessionNotification)]
struct SessionEvents {
    tx: Sender<crate::media::Request>,
    dirty: Arc<AtomicBool>,
}
impl IAudioSessionNotification_Impl for SessionEvents_Impl {
    fn OnSessionCreated(
        &self,
        _: windows::core::Ref<IAudioSessionControl>,
    ) -> windows::core::Result<()> {
        self.dirty.store(true, Ordering::SeqCst);
        let _ = self.tx.send(crate::media::Request::Wake);
        Ok(())
    }
}
#[implement(IMMNotificationClient)]
struct DeviceEvents {
    tx: Sender<crate::media::Request>,
    dirty: Arc<AtomicBool>,
}
impl DeviceEvents_Impl {
    fn wake(&self) -> windows::core::Result<()> {
        self.dirty.store(true, Ordering::SeqCst);
        let _ = self.tx.send(crate::media::Request::Wake);
        Ok(())
    }
}
impl IMMNotificationClient_Impl for DeviceEvents_Impl {
    fn OnDeviceStateChanged(&self, _: &PCWSTR, _: DEVICE_STATE) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnDeviceAdded(&self, _: &PCWSTR) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnDeviceRemoved(&self, _: &PCWSTR) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnDefaultDeviceChanged(
        &self,
        _: EDataFlow,
        _: ERole,
        _: &PCWSTR,
    ) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnPropertyValueChanged(
        &self,
        _: &PCWSTR,
        _: &windows::Win32::Foundation::PROPERTYKEY,
    ) -> windows::core::Result<()> {
        self.wake()
    }
}
impl PlayerAudio {
    unsafe fn read(&self) -> MediaValue<PlayerVolume> {
        match (self.volume.GetMasterVolume(), self.volume.GetMute()) {
            (Ok(level), Ok(muted)) if level.is_finite() && (0.0..=1.0).contains(&level) => {
                MediaValue::ready(PlayerVolume {
                    level: (level * 100.).round(),
                    muted: muted.as_bool(),
                    source: "applicationSession".into(),
                })
            }
            _ => MediaValue::absent(MediaAvailability::Error, "Cannot read application volume"),
        }
    }
}
impl Drop for PlayerAudio {
    fn drop(&mut self) {
        unsafe {
            let _ = self
                .control
                .UnregisterAudioSessionNotification(&self.events);
        }
    }
}
unsafe fn process_matches(pid: u32, source: &str) -> bool {
    let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
        return false;
    };
    let mut aumid = vec![0u16; 4096];
    let mut len = aumid.len() as u32;
    let result = GetApplicationUserModelId(process, &mut len, Some(PWSTR(aumid.as_mut_ptr())));
    let matched_aumid = result.is_ok()
        && String::from_utf16_lossy(&aumid[..len.saturating_sub(1) as usize])
            .eq_ignore_ascii_case(source);
    let matched = matched_aumid || {
        let mut path = vec![0u16; 32768];
        let mut len = path.len() as u32;
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut len,
        )
        .is_ok()
            && String::from_utf16_lossy(&path[..len as usize])
                .rsplit('\\')
                .next()
                .is_some_and(|name| executable_matches(name, source))
    };
    let _ = CloseHandle(process);
    matched
}
fn executable_matches(name: &str, source: &str) -> bool {
    name.eq_ignore_ascii_case(source)
        || (!source.contains(['.', '!', '/', '\\'])
            && name.to_ascii_lowercase().strip_suffix(".exe").is_some_and(|stem| stem.eq_ignore_ascii_case(source)))
}
/// Resolve only an unambiguous, active render-session PID using the same
/// AUMID/executable matching as player volume. Never guess a foreground process.
pub fn spectrum_process(source: &str) -> Result<u32, String> {
    unsafe {
        let find = || -> windows::core::Result<Vec<u32>> {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let mut pids = Vec::new();
            for index in 0..devices.GetCount()? {
                let manager: IAudioSessionManager2 = devices.Item(index)?.Activate(CLSCTX_ALL, None)?;
                let sessions = manager.GetSessionEnumerator()?;
                for index in 0..sessions.GetCount()? {
                    let control = sessions.GetSession(index)?;
                    if control.GetState()? != AudioSessionStateActive { continue; }
                    let extended: IAudioSessionControl2 = control.cast()?;
                    let pid = extended.GetProcessId()?;
                    if pid != 0 && process_matches(pid, source) { pids.push(pid); }
                }
            }
            pids.sort_unstable();
            pids.dedup();
            Ok(pids)
        };
        let pids = find().map_err(|e| e.to_string())?;
        match pids.as_slice() {
            [pid] => Ok(*pid),
            [] => Err("Nenhum processo de áudio ativo corresponde ao player".into()),
            _ => Err("Mais de um processo de áudio corresponde ao player".into()),
        }
    }
}
unsafe fn find_audio(
    source: &str,
    preferred: Option<&str>,
    tx: Sender<crate::media::Request>,
    dirty: Arc<AtomicBool>,
) -> windows::core::Result<Option<PlayerAudio>> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
    let mut matches = vec![];
    for device in 0..devices.GetCount()? {
        let manager: IAudioSessionManager2 = devices.Item(device)?.Activate(CLSCTX_ALL, None)?;
        let sessions = manager.GetSessionEnumerator()?;
        for index in 0..sessions.GetCount()? {
            let control = sessions.GetSession(index)?;
            let extended: IAudioSessionControl2 = control.cast()?;
            if control.GetState()? == AudioSessionStateExpired
                || !process_matches(extended.GetProcessId()?, source)
            {
                continue;
            }
            let volume: ISimpleAudioVolume = control.cast()?;
            let raw = extended.GetSessionInstanceIdentifier()?;
            let id = raw.to_string();
            CoTaskMemFree(Some(raw.0.cast()));
            matches.push((
                id?,
                control.GetState()? == AudioSessionStateActive,
                control,
                volume,
            ));
        }
    }
    let active = matches
        .iter()
        .map(|(_, active, _, _)| *active)
        .collect::<Vec<_>>();
    let preferred = matches
        .iter()
        .position(|(id, _, _, _)| Some(id.as_str()) == preferred);
    let Some(index) = select_audio(&active, preferred) else {
        return Ok(None);
    };
    let (id, _, control, volume) = matches.swap_remove(index);
    let events: IAudioSessionEvents = AudioEvents { tx, dirty }.into();
    control.RegisterAudioSessionNotification(&events)?;
    Ok(Some(PlayerAudio {
        id,
        control,
        volume,
        events,
    }))
}
fn select_audio(active: &[bool], preferred: Option<usize>) -> Option<usize> {
    let playing = active
        .iter()
        .enumerate()
        .filter(|(_, active)| **active)
        .map(|(i, _)| i)
        .collect::<Vec<_>>();
    match playing.as_slice() {
        [index] => Some(*index),
        [] => preferred.filter(|i| *i < active.len()).or_else(|| {
            if active.len() == 1 {
                Some(0)
            } else {
                None
            }
        }),
        _ => None,
    }
}
/// A matched application session is reused across reads. Only a Core Audio
/// notification, an expired session, a lost match or a different player forces
/// a fresh resolution.
fn audio_resolution_needed(
    has_match: bool,
    dirty: bool,
    expired: bool,
    source_changed: bool,
) -> bool {
    if !has_match {
        return true;
    }
    dirty || expired || source_changed
}
#[cfg(test)]
mod audio_tests {
    use super::*;
    #[test]
    fn executable_identity_accepts_exact_basenames_without_fuzzy_matching() {
        assert!(executable_matches("chrome.exe", "Chrome"));
        assert!(executable_matches("Spotify.exe", "spotify.exe"));
        for source in ["chrom", "chrome.e", "chrome!other", "folder/chrome", ""] {
            assert!(!executable_matches("chrome.exe", source));
        }
    }
    #[test]
    fn chooses_only_an_unambiguous_active_or_previously_owned_session() {
        assert_eq!(select_audio(&[false, true], None), Some(1));
        assert_eq!(select_audio(&[true, true], Some(0)), None);
        assert_eq!(select_audio(&[false, false], None), None);
        assert_eq!(select_audio(&[false, false], Some(1)), Some(1));
        assert_eq!(select_audio(&[false], None), Some(0));
        assert_eq!(select_audio(&[], None), None);
        assert_eq!(select_audio(&[false, false], Some(8)), None);
    }
    #[test]
    fn reuses_a_healthy_match_and_resolves_only_on_change() {
        assert!(!audio_resolution_needed(true, false, false, false));
        assert!(audio_resolution_needed(true, true, false, false));
        assert!(audio_resolution_needed(true, false, true, false));
        assert!(audio_resolution_needed(true, false, false, true));
        assert!(audio_resolution_needed(false, false, false, false));
    }
}
#[cfg(test)]
mod playback_tests {
    use super::*;
    #[test]
    fn pending_reads_complete_or_time_out_without_waiting() {
        let ready = Pending::new(IAsyncOperation::<u32>::ready(Ok(7))).unwrap();
        assert_eq!(ready.poll().unwrap(), Some(7));
        let (release, gate) = std::sync::mpsc::channel();
        let mut pending = Pending::new(IAsyncOperation::<u32>::spawn(move || {
            let _ = gate.recv_timeout(Duration::from_secs(1));
            Ok(7)
        }))
        .unwrap();
        assert_eq!(pending.poll().unwrap(), None);
        pending.deadline = Instant::now();
        let timed_out = pending.poll();
        let _ = release.send(());
        assert_eq!(timed_out.unwrap_err().code().0 as u32, 0x800705B4);
    }
    #[test]
    #[ignore = "Requires a running player; toggles playback while a gated artwork operation remains pending, then restores it"]
    fn live_controls_respond_while_artwork_is_pending() {
        unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
            .unwrap();
        }
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut source = WindowsMedia::new(tx).unwrap();
        let original = source.read_settled().unwrap().expect("session");
        let session = source.session.as_ref().unwrap();
        let properties_operation = session.TryGetMediaPropertiesAsync().unwrap();
        let properties = wait(&properties_operation.cast().unwrap(), || {
            properties_operation.GetResults()
        })
        .unwrap();
        let (release_metadata, metadata_gate) = std::sync::mpsc::channel();
        let revision = source.revision.fetch_add(1, Ordering::SeqCst) + 1;
        source.metadata = Some((
            revision,
            Pending::new(IAsyncOperation::spawn(move || {
                let _ = metadata_gate.recv_timeout(Duration::from_secs(5));
                Ok(properties)
            }))
            .unwrap(),
        ));
        source.audio_dirty.store(true, Ordering::SeqCst);
        let started = Instant::now();
        assert!(source.read().unwrap().is_some());
        assert!(source.metadata.is_some());
        assert!(
            source.audio_dirty.load(Ordering::SeqCst),
            "pending metadata must preserve audio notifications"
        );
        assert!(
            source.action_snapshot().is_err(),
            "unread track changes must still reject stale controls immediately"
        );
        let metadata_read_ms = started.elapsed().as_millis();
        let _ = release_metadata.send(());
        assert!(
            metadata_read_ms < 100,
            "pending metadata blocked the command queue"
        );
        source.read_settled().unwrap().expect("session");
        let (release, gate) = std::sync::mpsc::channel();
        source.artwork = Some(ArtworkRead::Opening(
            Pending::new(IAsyncOperation::spawn(move || {
                let _ = gate.recv_timeout(Duration::from_secs(5));
                Err(windows::core::Error::new(
                    windows::core::HRESULT(0x80004004u32 as i32),
                    "test artwork unavailable",
                ))
            }))
            .unwrap(),
        ));
        let mut read_and_action_ms = vec![];
        for _ in 0..2 {
            let started = Instant::now();
            let current = source.read().unwrap().expect("session");
            assert!(source.artwork.is_some(), "artwork must still be loading");
            source.act(&MediaAction::PlayPause, &current).unwrap();
            read_and_action_ms.push(started.elapsed().as_millis());
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                let next = source.read().unwrap().expect("session");
                if next.playback != current.playback {
                    break;
                }
                assert!(Instant::now() < deadline, "player did not confirm playback");
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        let _ = release.send(());
        assert_eq!(source.snapshot().unwrap().playback, original.playback);
        eprintln!("pending_metadata_read_ms={metadata_read_ms} pending_artwork_read_and_action_ms={read_and_action_ms:?}");
        assert!(read_and_action_ms.iter().all(|ms| *ms < 100));
        source.clear_session();
        assert!(!source.has_pending_read());
    }
    #[test]
    fn pending_metadata_or_artwork_yields_to_commands() {
        let (release, gate) = std::sync::mpsc::channel();
        let operation = windows_future::IAsyncOperation::<u32>::spawn(move || {
            gate.recv_timeout(Duration::from_secs(1)).map_err(|_| {
                windows::core::Error::new(
                    windows::core::HRESULT(0x800705B4u32 as i32),
                    "test dependency still loading",
                )
            })?;
            Ok(7)
        });
        let started = Instant::now();
        let pending = poll_result(
            &operation.cast().unwrap(),
            || operation.GetResults(),
            Instant::now() + Duration::from_secs(3),
        );
        let elapsed = started.elapsed();
        let _ = release.send(());
        assert!(
            matches!(pending, Ok(None)),
            "the worker must remain available while metadata/artwork is loading: {pending:?}"
        );
        assert!(
            elapsed < Duration::from_millis(50),
            "a pending read blocked commands for {elapsed:?}"
        );
        assert_eq!(
            wait(&operation.cast().unwrap(), || operation.GetResults()).unwrap(),
            7
        );
    }
    #[test]
    #[ignore = "Requires a live media player; toggles playback twice and measures native latency"]
    fn live_transport_latency() {
        unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
            .unwrap();
        }
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut source = WindowsMedia::new(tx).unwrap();
        let started = Instant::now();
        let data = source
            .read_settled()
            .unwrap()
            .expect("running media session");
        eprintln!("initial_read_ms={}", started.elapsed().as_millis());
        let mut elapsed = vec![];
        for _ in 0..2 {
            let started = Instant::now();
            let data = source.action_snapshot().unwrap();
            let read = started.elapsed();
            let started = Instant::now();
            let result = source.act(&MediaAction::PlayPause, &data);
            let action = started.elapsed();
            eprintln!(
                "read_ms={} action_ms={} success={}",
                read.as_millis(),
                action.as_millis(),
                result.is_ok()
            );
            result.unwrap();
            elapsed.push(read + action);
            let until = Instant::now() + Duration::from_secs(5);
            loop {
                let next = source.read_settled().unwrap().expect("session");
                if next.playback != data.playback {
                    break;
                }
                assert!(
                    Instant::now() < until,
                    "player did not confirm playback change"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        assert!(
            elapsed
                .iter()
                .all(|duration| *duration < Duration::from_millis(500)),
            "transport latency exceeds 500ms: {elapsed:?}"
        );
        assert_eq!(
            source.snapshot().unwrap().playback,
            data.playback,
            "restore original playback state"
        );
        source.revision.fetch_add(1, Ordering::SeqCst);
        assert!(
            source.action_snapshot().is_err(),
            "commands must reject unread track changes"
        );
    }
    #[test]
    #[ignore = "Requires a running player; simulates a duplicate metadata notification"]
    fn live_duplicate_metadata_preserves_track_identity() {
        unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
            .unwrap();
        }
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut source = WindowsMedia::new(tx).unwrap();
        let before = source.read_settled().unwrap().expect("session");
        source.revision.fetch_add(1, Ordering::SeqCst);
        let after = source.read_settled().unwrap().expect("session");
        assert_eq!(before.title, after.title, "fixture changed during test");
        assert_eq!(
            before.track_id, after.track_id,
            "a duplicate notification must not reset the heart or remount playback controls"
        );
    }
    #[test]
    #[ignore = "Requires a live media player; skips five tracks to measure transitions"]
    fn live_track_transitions() {
        unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
            .unwrap();
        }
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut source = WindowsMedia::new(tx).unwrap();
        let mut slow_commands = false;
        for _ in 0..5 {
            let data = source.read_settled().unwrap().expect("session");
            let started = Instant::now();
            source.act(&MediaAction::Next, &data).unwrap();
            let action_ms = started.elapsed().as_millis();
            let until = Instant::now() + Duration::from_secs(8);
            let mut unavailable = 0;
            loop {
                match source.read() {
                    Ok(Some(next)) => {
                        let changed = next.title != data.title;
                        if changed {
                            break;
                        }
                    }
                    _ => unavailable += 1,
                }
                if Instant::now() >= until {
                    panic!("track did not update");
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            eprintln!(
                "next_action_ms={action_ms} transition_ms={} unavailable_reads={unavailable}",
                started.elapsed().as_millis()
            );
            slow_commands |= action_ms >= 500;
            assert_eq!(
                unavailable, 0,
                "track switches must preserve a usable session"
            );
        }
        // GSMTC metadata delivery follows the external player's loading time.
        // The command acknowledgement must remain fast while that happens.
        assert!(
            !slow_commands,
            "native command acknowledgement exceeded 500ms"
        );
    }
    #[test]
    fn maps_repeat_modes_without_inventing_values() {
        for mode in [RepeatMode::None, RepeatMode::Track, RepeatMode::List] {
            assert_eq!(repeat_mode(auto_repeat(mode)), Some(mode));
        }
        assert_eq!(repeat_mode(MediaPlaybackAutoRepeatMode(9)), None);
    }
}
pub fn audio_diagnostics(source: &str) -> serde_json::Value {
    let result = (|| -> windows::core::Result<serde_json::Value> {
        unsafe {
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let devices = en.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let mut rows = vec![];
            for index in 0..devices.GetCount()? {
                let manager: IAudioSessionManager2 =
                    devices.Item(index)?.Activate(CLSCTX_ALL, None)?;
                let sessions = manager.GetSessionEnumerator()?;
                for i in 0..sessions.GetCount()? {
                    let control = sessions.GetSession(i)?;
                    let extended: IAudioSessionControl2 = control.cast()?;
                    let pid = extended.GetProcessId()?;
                    rows.push(serde_json::json!({"pid":pid,"matchesSource":process_matches(pid,source),"state":control.GetState()?.0}));
                }
            }
            Ok(serde_json::json!({"sessions":rows}))
        }
    })();
    match result {
        Ok(value) => value,
        Err(error) => serde_json::json!({"error":error.to_string()}),
    }
}
#[implement(IAudioSessionEvents)]
struct AudioEvents {
    tx: Sender<crate::media::Request>,
    dirty: Arc<AtomicBool>,
}
impl AudioEvents_Impl {
    fn wake(&self) -> windows::core::Result<()> {
        self.dirty.store(true, Ordering::SeqCst);
        let _ = self.tx.send(crate::media::Request::Wake);
        Ok(())
    }
}
impl IAudioSessionEvents_Impl for AudioEvents_Impl {
    fn OnDisplayNameChanged(&self, _: &PCWSTR, _: *const GUID) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnIconPathChanged(&self, _: &PCWSTR, _: *const GUID) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnSimpleVolumeChanged(&self, _: f32, _: BOOL, _: *const GUID) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnChannelVolumeChanged(
        &self,
        _: u32,
        _: *const f32,
        _: u32,
        _: *const GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnGroupingParamChanged(&self, _: *const GUID, _: *const GUID) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnStateChanged(&self, _: AudioSessionState) -> windows::core::Result<()> {
        self.wake()
    }
    fn OnSessionDisconnected(&self, _: AudioSessionDisconnectReason) -> windows::core::Result<()> {
        self.wake()
    }
}

// Resolve only visible top-level windows whose process matches the native session.
// Multiple windows are ambiguous; never guess a browser tab or execute a command.
fn player_window(source: &str) -> Option<HWND> {
    struct Search<'a> {
        source: &'a str,
        terminal: Option<u32>,
        windows: Vec<HWND>,
    }
    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> BOOL {
        let search = &mut *(param.0 as *mut Search<'_>);
        if !IsWindowVisible(hwnd).as_bool()
            || GetWindowTextLengthW(hwnd) == 0
            || GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.is_invalid())
        {
            return BOOL(1);
        }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 && (search.terminal == Some(pid) || process_matches(pid, search.source)) {
            search.windows.push(hwnd);
        }
        BOOL(1)
    }
    let mut search = Search {
        source,
        terminal: None,
        windows: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(visit), LPARAM(&mut search as *mut _ as isize)).ok()?;
    }
    if search.windows.is_empty() {
        search.terminal = terminal_for_player(source);
        search.terminal?;
        unsafe {
            EnumWindows(Some(visit), LPARAM(&mut search as *mut _ as isize)).ok()?;
        }
    }
    unique_player_window(&search.windows)
}
fn unique_player_window(windows: &[HWND]) -> Option<HWND> {
    if windows.len() == 1 {
        Some(windows[0])
    } else {
        None
    }
}
fn focus_player(source: &str) -> windows::core::Result<()> {
    let hwnd = player_window(source).ok_or_else(|| {
        windows::core::Error::new(
            windows::core::HRESULT(0x80004005u32 as i32),
            "Não foi possível identificar uma janela única do player",
        )
    })?;
    unsafe {
        // Recheck after enumeration, before activating an existing application.
        if !IsWindow(Some(hwnd)).as_bool() || player_window(source) != Some(hwnd) {
            return Err(windows::core::Error::from_thread());
        }
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindowAsync(hwnd, SW_RESTORE);
        }
        if !SetForegroundWindow(hwnd).as_bool() {
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x80004005u32 as i32),
                "O Windows não permitiu ativar o player",
            ));
        }
    }
    Ok(())
}
#[cfg(test)]
mod player_window_tests {
    use super::*;
    #[test]
    fn never_selects_an_ambiguous_or_missing_window() {
        let one = HWND(1usize as *mut _);
        let two = HWND(2usize as *mut _);
        assert_eq!(unique_player_window(&[]), None);
        assert_eq!(unique_player_window(&[one]), Some(one));
        assert_eq!(unique_player_window(&[one, two]), None);
    }
}

// Console players own no top-level window. Follow only their verified process
// ancestry to a known terminal host; never select a terminal by its window title.
type ProcessTree = std::collections::HashMap<u32, (u32, String)>;
fn terminal_ancestor(player: u32, tree: &ProcessTree) -> Option<u32> {
    let mut pid = player;
    let mut seen = std::collections::HashSet::new();
    for _ in 0..16 {
        if !seen.insert(pid) {
            return None;
        }
        let (parent, _) = tree.get(&pid)?;
        let (_, name) = tree.get(parent)?;
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "windowsterminal.exe"
                | "wezterm-gui.exe"
                | "alacritty.exe"
                | "mintty.exe"
                | "conhost.exe"
                | "openconsole.exe"
        ) {
            return Some(*parent);
        }
        // Stop at non-shell ancestors instead of following into a launcher/IDE.
        if !matches!(
            name.to_ascii_lowercase().as_str(),
            "powershell.exe"
                | "pwsh.exe"
                | "cmd.exe"
                | "bash.exe"
                | "nu.exe"
                | "fish.exe"
                | "zsh.exe"
        ) {
            return None;
        }
        pid = *parent;
    }
    None
}
fn terminal_for_player(source: &str) -> Option<u32> {
    if !source.to_ascii_lowercase().ends_with(".exe") {
        return None;
    }
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut tree = ProcessTree::new();
        let mut players = Vec::new();
        let mut next = Process32FirstW(snapshot, &mut entry);
        while next.is_ok() {
            let end = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            tree.insert(
                entry.th32ProcessID,
                (
                    entry.th32ParentProcessID,
                    String::from_utf16_lossy(&entry.szExeFile[..end]),
                ),
            );
            if tree
                .get(&entry.th32ProcessID)
                .is_some_and(|(_, name)| name.eq_ignore_ascii_case(source))
                && process_matches(entry.th32ProcessID, source)
            {
                players.push(entry.th32ProcessID);
            }
            next = Process32NextW(snapshot, &mut entry);
        }
        let _ = CloseHandle(snapshot);
        if players.len() != 1 {
            return None;
        }
        let terminal = terminal_ancestor(players[0], &tree)?;
        // Reject reused parent PIDs: the terminal must predate the player.
        let created = |pid| -> Option<u64> {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut creation = Default::default();
            let mut exit = Default::default();
            let mut kernel = Default::default();
            let mut user = Default::default();
            let result = GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user);
            let _ = CloseHandle(process);
            result.ok()?;
            Some(((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64)
        };
        if created(terminal)? > created(players[0])? {
            return None;
        }
        Some(terminal)
    }
}
#[cfg(test)]
mod terminal_tests {
    use super::*;
    #[test]
    #[ignore = "Requires one running spotatui in a supported terminal; reads window identity only"]
    fn live_spotatui_resolves_its_terminal_window() {
        let terminal = terminal_for_player("spotatui.exe").expect("terminal process");
        let hwnd = player_window("spotatui.exe").expect("terminal window");
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        assert_eq!(pid, terminal);
    }
    #[test]
    fn follows_spotatui_shell_to_its_terminal_only() {
        let tree = ProcessTree::from([
            (10, (20, "spotatui.exe".into())),
            (20, (30, "powershell.exe".into())),
            (30, (40, "WindowsTerminal.exe".into())),
            (40, (0, "explorer.exe".into())),
            (50, (40, "WindowsTerminal.exe".into())),
        ]);
        assert_eq!(terminal_ancestor(10, &tree), Some(30));
        assert_eq!(terminal_ancestor(40, &tree), None);
        assert_eq!(terminal_ancestor(999, &tree), None);
    }
    #[test]
    fn rejects_loops_and_unrelated_ancestors() {
        let tree = ProcessTree::from([
            (10, (20, "spotatui.exe".into())),
            (20, (10, "powershell.exe".into())),
        ]);
        assert_eq!(terminal_ancestor(10, &tree), None);
    }
}

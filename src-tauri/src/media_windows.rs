use windows_future::{AsyncStatus, IAsyncInfo};
// WinRT media sessions and per-application Core Audio. All handles stay native.
use crate::media_contract::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::Sender,
        Arc,
    },
    time::{Duration, Instant},
};
use windows::{
    core::{implement, Interface, BOOL, GUID, HSTRING, PCWSTR, PWSTR},
    ApplicationModel::AppInfo,
    Foundation::TypedEventHandler,
    Media::Control::*,
    Storage::Streams::DataReader,
    Win32::{
        Foundation::CloseHandle,
        Media::Audio::*,
        Storage::Packaging::Appx::GetApplicationUserModelId,
        System::{Com::*, Threading::*},
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

pub struct WindowsMedia {
    manager: GlobalSystemMediaTransportControlsSessionManager,
    manager_tokens: Vec<(bool, i64)>,
    session: Option<GlobalSystemMediaTransportControlsSession>,
    session_tokens: Vec<(u8, i64)>,
    revision: Arc<AtomicU64>,
    seen: u64,
    serial: u64,
    cached: Option<MediaData>,
    tx: Sender<crate::media::Request>,
    audio: Option<PlayerAudio>,
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
            tx,
            audio: None,
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
    pub fn read(&mut self) -> windows::core::Result<Option<MediaData>> {
        if self.discovery.is_none() {
            self.discovery = unsafe { AudioDiscovery::new(self.tx.clone()).ok() };
        }
        if let Some(discovery) = &mut self.discovery {
            // Only native events trigger this path; the periodic Spotify tick
            // reuses snapshots without enumerating devices or polling GSMTC.
            let _ = unsafe { discovery.reconcile() };
        }
        self.reconcile()?;
        let Some(session) = self.session.as_ref() else {
            return Ok(None);
        };
        let revision = self.revision.load(Ordering::SeqCst);
        if self.cached.is_none() || revision != self.seen {
            let properties = complete!(session.TryGetMediaPropertiesAsync())?;
            let player_id = session.SourceAppUserModelId()?.to_string();
            let player_name = AppInfo::GetFromAppUserModelId(&HSTRING::from(&player_id))
                .and_then(|a| a.DisplayInfo())
                .and_then(|d| d.DisplayName())
                .map(|n| n.to_string())
                .unwrap_or_else(|_| player_id.trim_end_matches(".exe").to_string());
            let artwork = artwork(&properties);
            // A session/metadata event during an async read invalidates the whole result.
            if revision != self.revision.load(Ordering::SeqCst)
                || self.manager.GetCurrentSession().ok().as_ref() != Some(session)
            {
                return Err(windows::core::Error::new(
                    windows::core::HRESULT(0x8000000Au32 as i32),
                    "Media changed during read",
                ));
            }
            self.cached = Some(MediaData {
                session_id: format!("session-{}", self.serial),
                track_id: format!("track-{}-{revision}", self.serial),
                player_id,
                player_name,
                title: properties.Title()?.to_string(),
                artist: properties.Artist()?.to_string(),
                album: properties.AlbumTitle()?.to_string(),
                artwork,
                playback: "unknown".into(),
                progress: MediaValue::absent(MediaAvailability::Unavailable, "No timeline"),
                volume: MediaValue::absent(
                    MediaAvailability::Unavailable,
                    "No unambiguous application audio session",
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
                    favorite: false,
                },
            });
            self.seen = revision;
        }
        let data = self.cached.as_mut().unwrap();
        let playback = session.GetPlaybackInfo()?;
        let status = playback.PlaybackStatus()?;
        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
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
        // Resolve across active render endpoints. Ambiguity always disables volume.
        let next = unsafe {
            find_audio(
                &data.player_id,
                self.audio.as_ref().map(|a| a.id.as_str()),
                self.tx.clone(),
            )
        };
        let mut audio_error = None;
        match next {
            Ok(Some(audio)) => {
                if self.audio.as_ref().is_none_or(|old| old.id != audio.id) {
                    self.audio = Some(audio);
                }
            }
            Ok(None) => self.audio = None,
            Err(error) => {
                self.audio = None;
                audio_error = Some(error.to_string());
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
        let session = self.session.as_ref().ok_or("Media session closed")?;
        if self.manager.GetCurrentSession().ok().as_ref() != Some(session)
            || self.revision.load(Ordering::SeqCst) != self.seen
        {
            return Err("Media session or track changed".into());
        }
        let properties =
            (|| -> windows::core::Result<_> { complete!(session.TryGetMediaPropertiesAsync()) })()
                .map_err(|e| e.to_string())?;
        if self.manager.GetCurrentSession().ok().as_ref() != Some(session)
            || self.revision.load(Ordering::SeqCst) != self.seen
            || properties.Title().map_err(|e| e.to_string())?.to_string() != data.title
            || properties.Artist().map_err(|e| e.to_string())?.to_string() != data.artist
            || properties
                .AlbumTitle()
                .map_err(|e| e.to_string())?
                .to_string()
                != data.album
        {
            return Err("Media track changed".into());
        }
        let result = (|| -> windows::core::Result<bool> {
            Ok(match action {
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
fn artwork(p: &GlobalSystemMediaTransportControlsSessionMediaProperties) -> MediaValue<String> {
    let result = (|| -> windows::core::Result<Option<String>> {
        let stream = complete!(p.Thumbnail()?.OpenReadAsync())?;
        let size = stream.Size()?;
        if size == 0 || size > 5 * 1024 * 1024 {
            return Ok(None);
        }
        let input = stream.GetInputStreamAt(0)?;
        let reader = DataReader::CreateDataReader(&input)?;
        let loaded = complete!(reader.LoadAsync(size as u32))?;
        let mut bytes = vec![0; loaded as usize];
        reader.ReadBytes(&mut bytes)?;
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "image/png"
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            "image/jpeg"
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            "image/gif"
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            "image/webp"
        } else {
            return Ok(None);
        };
        Ok(Some(format!(
            "data:{mime};base64,{}",
            STANDARD.encode(bytes)
        )))
    })();
    match result {
        Ok(Some(value)) => MediaValue::ready(value),
        _ => MediaValue::absent(
            MediaAvailability::Unavailable,
            "Artwork missing, invalid or larger than 5 MiB",
        ),
    }
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
}
impl AudioDiscovery {
    unsafe fn new(tx: Sender<crate::media::Request>) -> windows::core::Result<Self> {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device_events: IMMNotificationClient = DeviceEvents { tx: tx.clone() }.into();
        enumerator.RegisterEndpointNotificationCallback(&device_events)?;
        let mut this = Self {
            enumerator,
            device_events,
            sessions: vec![],
            tx,
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
}
impl IAudioSessionNotification_Impl for SessionEvents_Impl {
    fn OnSessionCreated(
        &self,
        _: windows::core::Ref<IAudioSessionControl>,
    ) -> windows::core::Result<()> {
        let _ = self.tx.send(crate::media::Request::Wake);
        Ok(())
    }
}
#[implement(IMMNotificationClient)]
struct DeviceEvents {
    tx: Sender<crate::media::Request>,
}
impl DeviceEvents_Impl {
    fn wake(&self) -> windows::core::Result<()> {
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
                .is_some_and(|name| name.eq_ignore_ascii_case(source))
    };
    let _ = CloseHandle(process);
    matched
}
unsafe fn find_audio(
    source: &str,
    preferred: Option<&str>,
    tx: Sender<crate::media::Request>,
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
    let events: IAudioSessionEvents = AudioEvents { tx }.into();
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
#[cfg(test)]
mod audio_tests {
    use super::*;
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
}
impl AudioEvents_Impl {
    fn wake(&self) -> windows::core::Result<()> {
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

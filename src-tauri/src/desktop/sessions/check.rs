use super::*;

static HIDES: LazyLock<Mutex<HashMap<usize, u32>>> = LazyLock::new(Default::default);
static OPEN_STARTED: LazyLock<Mutex<HashMap<String, f64>>> = LazyLock::new(Default::default);
static ENABLED: AtomicBool = AtomicBool::new(false);
static TIMINGS: LazyLock<Mutex<HashMap<String, (f64, f64)>>> = LazyLock::new(Default::default);

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
        * 1000.
}
pub(super) fn received(session: &str) {
    if ENABLED.load(Ordering::Relaxed) {
        TIMINGS
            .lock()
            .unwrap()
            .insert(session.into(), (now_ms(), 0.));
    }
}
pub(super) fn committed(session: &str) {
    if ENABLED.load(Ordering::Relaxed) {
        if let Some(value) = TIMINGS.lock().unwrap().get_mut(session) {
            value.1 = now_ms();
        }
    }
}

pub(super) unsafe fn observe_visibility(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    if (msg == WM_SHOWWINDOW && wp.0 == 0)
        || (msg == WM_WINDOWPOSCHANGING
            && (*(lp.0 as *const WINDOWPOS)).flags.contains(SWP_HIDEWINDOW))
    {
        *HIDES.lock().unwrap().entry(hwnd.0 as usize).or_default() += 1;
    }
}

/// A background harness has not received the trigger's user input. Temporarily
/// attach input queues to reproduce that foreground eligibility for this check.
pub(super) fn focus(hwnd: HWND) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    unsafe {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
        let foreground = GetForegroundWindow();
        let current = GetCurrentThreadId();
        let other = GetWindowThreadProcessId(foreground, None);
        let attached =
            other != 0 && other != current && AttachThreadInput(current, other, true).as_bool();
        let _ = SetForegroundWindow(hwnd);
        if attached {
            let _ = AttachThreadInput(current, other, false);
        }
    }
}

/// The check uses a hidden native source window, never a second AppBar reservation.
#[cfg(debug_assertions)]
pub fn source(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let source = surface_builder(app, "bar-pinned-check")
        .title("Strata pinned check source")
        .visible(false)
        .focused(false)
        .decorations(false)
        .skip_taskbar(true)
        .inner_size(800., 36.)
        .build()?;
    unsafe {
        enforce_floating_frame(HWND(source.hwnd()?.0));
    }
    Ok(())
}

/// Opt-in integration check against actual WebView2 windows and Win32 rectangles.
#[cfg(debug_assertions)]
pub fn start(app: AppHandle) {
    ENABLED.store(true, Ordering::Relaxed);
    use std::time::Duration;
    fn ui<T: Send + 'static>(
        app: &AppHandle,
        task: impl FnOnce(AppHandle) -> T + Send + 'static,
    ) -> T {
        let (tx, rx) = mpsc::channel();
        let handle = app.clone();
        app.run_on_main_thread(move || {
            let _ = tx.send(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
                || task(handle),
            )));
        })
        .unwrap();
        match rx
            .recv_timeout(Duration::from_secs(15))
            .expect("Pinned check UI timeout")
        {
            Ok(value) => value,
            Err(error) => std::panic::resume_unwind(error),
        }
    }
    fn local_snapshot() -> serde_json::Value {
        let values = snapshot()
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["processId"].as_u64() == Some(std::process::id() as u64))
            .cloned()
            .collect::<Vec<_>>();
        serde_json::json!(values)
    }
    fn transient_window() -> String {
        let id = transient_id().expect("No transient session");
        WINDOWS.lock().unwrap()[&id].window.clone()
    }
    fn read_motion(app: &AppHandle, label: String, token: &'static str) -> serde_json::Value {
        for _ in 0..200 {
            let label = label.clone();
            let value = ui(app, move |app| {
                let url = app.get_webview_window(&label).unwrap().url().unwrap();
                let encoded = format!("v={}", url.fragment().unwrap_or(""));
                let decoded = url::form_urlencoded::parse(encoded.as_bytes())
                    .next()
                    .map(|(_, v)| v.into_owned())
                    .unwrap_or_default();
                serde_json::from_str::<serde_json::Value>(&decoded).ok()
            });
            if let Some(value) = value.filter(|v| v["motion"] == token) {
                return value;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("Motion trace {token} timed out");
    }
    fn trace_opening(app: &AppHandle) -> String {
        ui(app, |app| {
            let label = IDLE.lock().unwrap().front().cloned().unwrap();
            app.get_webview_window(&label).unwrap().eval(r#"{
                let running=false;
                const observer=new MutationObserver(start);
                function start(){
                    const d=document.querySelector('[role=dialog]');if(!d || running)return;
                    running=true;observer.disconnect();const frames=[],started=performance.now(),v=d.parentElement;
                    function sample(){
                        const s=getComputedStyle(v),m=s.transform==='none'?new DOMMatrixReadOnly():new DOMMatrixReadOnly(s.transform);
                        const nativeTransform=v.getAnimations().some(a=>a.playState==='running' && a.effect?.getKeyframes().some(k=>k.transform));
                        frames.push({at:performance.now()-started,clip:s.clipPath,opacity:Number(s.opacity),scaleX:m.m11,scaleY:m.m22,nativeTransform,width:v.offsetWidth,height:v.offsetHeight,viewport:[innerWidth,innerHeight]});
                        if(performance.now()-started>650)location.hash=encodeURIComponent(JSON.stringify({motion:'opening',frames}));
                        else requestAnimationFrame(sample);
                    }requestAnimationFrame(sample);
                }observer.observe(document.body,{childList:true,subtree:true});start();
            }"#).unwrap();
            label
        })
    }
    fn wait_visible(app: &AppHandle) {
        for _ in 0..100 {
            if ui(app, |app| {
                app.get_webview_window(&transient_window())
                    .is_some_and(|w| unsafe {
                        IsWindowVisible(HWND(w.hwnd().unwrap().0)).as_bool()
                    })
            }) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("Overlay did not become visible");
    }
    fn wait_pinned(app: &AppHandle, count: usize) {
        // Tauri queues destruction; the HWND can outlive the command acknowledgment.
        for _ in 0..50 {
            if ui(app, |_| local_snapshot()).as_array().unwrap().len() == count {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("Expected {count} pinned HWNDs after lifecycle transition");
    }
    fn open(app: &AppHandle, source: String, id: &'static str, component: &'static str) {
        eprintln!("Pinned check: opening {id}");
        OPEN_STARTED.lock().unwrap().insert(id.into(), now_ms());
        ui(app, move |app| {
            let target = transient_id()
                .and_then(|id| WINDOWS.lock().unwrap().get(&id).map(|e| e.window.clone()))
                .or_else(|| IDLE.lock().unwrap().front().cloned());
            if let Some(window) = target.and_then(|label| app.get_webview_window(&label)) {
                window.eval(r#"{
                    window.__strataStopFirstPopup?.();
                    const previous=document.querySelector('[role=dialog]');
                    const result=window.__strataFirstPopup={session:SESSION_TOKEN,firstAt:null,loading:false,textLength:0};
                    const observer=new MutationObserver(() => {
                        const d=document.querySelector('[role=dialog]');
                        if(!d || d===previous)return;
                        result.firstAt ??= performance.timeOrigin+performance.now();
                        result.textLength=d.innerText.length;
                        result.loading ||= d.innerText.includes('Carregando');
                    });
                    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
                    window.__strataStopFirstPopup=()=>observer.disconnect();
                }"#.replace("SESSION_TOKEN", &serde_json::to_string(id).unwrap())).unwrap();
            }
            let bar = app.get_webview_window(&source).unwrap();
            let request: OverlayRequest = serde_json::from_value(serde_json::json!({"v":1,"kind":"popover","session":id,"component":component,"params":{},"text":component,"anchor":{"x":100,"y":0,"width":40,"height":30},"size":{"width":1,"height":1},"side":"bottom"})).unwrap();
            overlay_show(&app, &bar, &request).unwrap();
        });
        wait_visible(app);
    }
    fn detach(app: &AppHandle, id: &'static str) -> u128 {
        let original = ui(app, |app| {
            app.get_webview_window(&transient_window())
                .unwrap()
                .label()
                .to_string()
        });
        let started = std::time::Instant::now();
        ui(app, |app| {
            app.get_webview_window(&transient_window())
                .unwrap()
                .eval("document.querySelector('button[aria-label=\"Fixar popup\"]')?.click()")
                .unwrap();
        });
        for _ in 0..120 {
            if ui(app, move |_| {
                WINDOWS
                    .lock()
                    .unwrap()
                    .get(id)
                    .is_some_and(|e| e.mode == Mode::Pinned)
            }) {
                let pinned = ui(app, move |_| WINDOWS.lock().unwrap()[id].window.clone());
                assert_eq!(
                    original,
                    pinned,
                    "Pin replaced the already-rendered WebView after {} ms",
                    started.elapsed().as_millis()
                );
                return started.elapsed().as_millis();
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("Pin button did not reveal {id}");
    }
    fn painted(app: &AppHandle, id: &'static str) -> serde_json::Value {
        let mut last = None;
        for _ in 0..60 {
            let value = ui(app, move |app| {
                let label = WINDOWS.lock().unwrap()[id].window.clone();
                let window = app.get_webview_window(&label).unwrap();
                window.eval(r#"{ const d=document.querySelector('[role=dialog]'); if(d){const r=d.getBoundingClientRect();let opacity=1;for(let n=d;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);location.hash=encodeURIComponent(JSON.stringify({session:SESSION_TOKEN,firstContent:window.__strataFirstPopup??null,text:d.innerText,opacity,width:r.width,height:r.height,x:r.x,y:r.y,viewport:[innerWidth,innerHeight]}));}}"#.replace("SESSION_TOKEN", &serde_json::to_string(id).unwrap())).unwrap();
                let url = window.url().unwrap();
                let fragment = url.fragment().unwrap_or("");
                let decoded = url::form_urlencoded::parse(format!("v={fragment}").as_bytes())
                    .next()
                    .map(|(_, v)| v.into_owned())
                    .unwrap_or_default();
                serde_json::from_str::<serde_json::Value>(&decoded).ok()
            });
            if let Some(value) = value.filter(|v| v["session"] == id) {
                if value["opacity"].as_f64().unwrap_or(0.) > 0.9
                    && value["width"].as_f64().unwrap_or(0.) > 100.
                    && value["viewport"][0].as_f64().unwrap_or(0.)
                        >= value["width"].as_f64().unwrap_or(0.) - 1.
                    && value["viewport"][1].as_f64().unwrap_or(0.)
                        >= value["height"].as_f64().unwrap_or(0.) - 1.
                {
                    return value;
                }
                last = Some(value);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("Pinned content is not painted for {id}: {last:?}");
    }
    fn continuity(app: &AppHandle, id: &'static str) -> serde_json::Value {
        let label = ui(app, move |_| WINDOWS.lock().unwrap()[id].window.clone());
        let target = label.clone();
        let original = ui(app, move |app| {
            app.get_webview_window(&target).unwrap().hwnd().unwrap().0 as usize
        });
        let mut samples = Vec::new();
        let hides_before = *HIDES.lock().unwrap().get(&original).unwrap_or(&0);
        for cycle in 0..30 {
            let token = format!("cycle-{cycle}");
            let target = label.clone();
            let js = format!(
                r#"{{
                const token={token:?};
                function begin() {{
                const d=document.querySelector('[role=dialog]');
                const button=d.querySelector('button[aria-pressed]');
                if(button.disabled) {{ requestAnimationFrame(begin);return; }}
                let input=d.querySelector('[data-continuity-input]');
                if(!input) {{ input=document.createElement('input');input.dataset.continuityInput='';input.value='unsaved draft';d.append(input); }}
                const expected=button.getAttribute('aria-pressed')==='false';
                let minOpacity=1, missing=false, frames=0, acknowledged=null, doneFrames=0, firstFrameAt=null;
                const started=performance.now();
                const observe=new MutationObserver(() => {{
                    if(acknowledged===null && button.getAttribute('aria-pressed')===String(expected)) acknowledged=performance.now()-started;
                    if(!d.isConnected || !input.isConnected) missing=true;
                }});
                observe.observe(document.body,{{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']}});
                function sample() {{
                    frames++; let opacity=1;
                    for(let n=d;n;n=n.parentElement) opacity*=Number(getComputedStyle(n).opacity);
                    minOpacity=Math.min(minOpacity,opacity);
                    missing ||= !d.isConnected || !input.isConnected || input.value!=='unsaved draft' || d.getBoundingClientRect().width<100;
                    if(acknowledged!==null) {{ doneFrames++;firstFrameAt ??= performance.timeOrigin+performance.now(); }}
                    if((doneFrames>=3 && !button.disabled) || performance.now()-started>3000) {{
                        observe.disconnect();location.hash=encodeURIComponent(JSON.stringify({{token,acknowledged,clickedAt:performance.timeOrigin+started,confirmedAt:performance.timeOrigin+started+acknowledged,firstFrameAt,minOpacity,missing,frames,commandFinished:!button.disabled,pinError:d.querySelector(':scope > p[role=alert]')?.textContent ?? '',pinned:expected}}));
                    }} else requestAnimationFrame(sample);
                }}
                button.click();requestAnimationFrame(sample);
                }} begin();
            }}"#
            );
            ui(app, move |app| {
                app.get_webview_window(&target).unwrap().eval(js).unwrap()
            });
            let mut result = None;
            for _ in 0..300 {
                let target = label.clone();
                let value = ui(app, move |app| {
                    let window = app.get_webview_window(&target).unwrap();
                    let hwnd = HWND(window.hwnd().unwrap().0);
                    assert_eq!(hwnd.0 as usize, original, "Mode replaced HWND");
                    assert!(unsafe { IsWindowVisible(hwnd).as_bool() }, "Mode hid HWND");
                    let url = window.url().unwrap();
                    let encoded = format!("v={}", url.fragment().unwrap_or(""));
                    let decoded = url::form_urlencoded::parse(encoded.as_bytes())
                        .next()
                        .map(|(_, v)| v.into_owned())
                        .unwrap_or_default();
                    serde_json::from_str::<serde_json::Value>(&decoded).ok()
                });
                if let Some(value) = value.filter(|v| v["token"] == token) {
                    result = Some(value);
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let mut value = result.expect("Mode frame acknowledgment timed out");
            assert_eq!(
                value["commandFinished"], true,
                "Pin response never completed: {value}"
            );
            assert_eq!(value["pinError"], "", "Pin command failed: {value}");
            let native = TIMINGS.lock().unwrap()[id];
            value["commandReceivedAtUtcMs"] = native.0.into();
            value["modeCommittedAtUtcMs"] = native.1.into();
            assert_eq!(value["missing"], false, "Content was replaced: {value}");
            assert!(
                value["minOpacity"].as_f64().unwrap() > 0.99,
                "Content faded: {value}"
            );
            assert!(
                value["acknowledged"].is_number(),
                "Mode was never confirmed: {value}"
            );
            samples.push(value);
        }
        let mut times: Vec<_> = samples
            .iter()
            .map(|v| v["acknowledged"].as_f64().unwrap())
            .collect();
        times.sort_by(|a, b| a.total_cmp(b));
        let p95 = times[(times.len() * 95).div_ceil(100) - 1];
        assert_eq!(
            *HIDES.lock().unwrap().get(&original).unwrap_or(&0),
            hides_before,
            "A mode transition hid the native window between samples"
        );
        assert!(p95 < 100., "Mode acknowledgment p95 exceeded 100 ms: {p95}");
        serde_json::json!({"p95Ms":p95,"sameHwnd":true,"samples":samples})
    }
    fn reserve_cost(app: &AppHandle) -> serde_json::Value {
        fn wait_ready(app: &AppHandle) {
            for _ in 0..200 {
                if ui(app, |_| {
                    let idle = IDLE.lock().unwrap();
                    let ready = DOCUMENT_READY.lock().unwrap();
                    !idle.is_empty() && idle.iter().all(|host| ready.contains(host))
                }) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            panic!("Reserve document did not finish initialization");
        }
        wait_ready(app);
        fn sample(phase: &str) -> serde_json::Value {
            let output = std::env::temp_dir().join(format!(
                "strata-reserve-{}-{phase}-{}.json",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("scripts/measure-idle.ps1");
            let result = std::process::Command::new("powershell")
                .args(["-NoProfile", "-File"])
                .arg(script)
                .args([
                    "-Seconds",
                    "3",
                    "-ProcessId",
                    &std::process::id().to_string(),
                    "-ExcludeSensorService",
                    "-OutputPath",
                ])
                .arg(&output)
                .output()
                .expect("Cannot measure reserve");
            assert!(
                result.status.success(),
                "Reserve measurement failed: {}",
                String::from_utf8_lossy(&result.stderr)
            );
            serde_json::from_slice(&std::fs::read(output).unwrap()).unwrap()
        }
        ui(app, |app| {
            let label = IDLE.lock().unwrap().pop_front().unwrap();
            app.get_webview_window(&label).unwrap().destroy().unwrap();
        });
        std::thread::sleep(Duration::from_secs(2));
        let without = sample("without");
        ui(app, |app| prepare(&app).unwrap());
        wait_ready(app);
        std::thread::sleep(Duration::from_secs(2));
        let with = sample("with");
        serde_json::json!({"withoutReserve":without,"withReserve":with,
            "privateMiBDelta":with["summary"]["meanPrivateMiB"].as_f64().unwrap()-without["summary"]["meanPrivateMiB"].as_f64().unwrap(),
            "cpuPercentMachineDelta":with["summary"]["meanCpuPercentMachine"].as_f64().unwrap()-without["summary"]["meanCpuPercentMachine"].as_f64().unwrap()})
    }
    fn reminder_expiry(app: &AppHandle) -> serde_json::Value {
        use crate::reminders_contract::{CreateReminder, ReminderMode};
        let id = ui(app, |app| {
            let state = app.state::<crate::reminders::Reminders>();
            let snapshot = state
                .create(
                    CreateReminder {
                        message: "Native expiry regression check".into(),
                        mode: ReminderMode::Duration { seconds: 1 },
                        scheduled_at: None,
                        event_duration_seconds: None,
                        sync_calendar: Some(false),
                    },
                    crate::reminders::now(),
                )
                .unwrap();
            let reminder = snapshot.reminders.last().unwrap();
            let source = app.get_webview_window("bar-pinned-check").unwrap();
            reminders_set_anchor(
                source,
                OverlayAnchor {
                    x: 100.,
                    y: 0.,
                    width: 40.,
                    height: 30.,
                },
                Some(format!("{}:{:.0}", reminder.id, reminder.notify_at)),
            )
            .unwrap();
            app.state::<crate::reminders::ReminderScheduler>().wake();
            reminder.id.clone()
        });
        let mut observed = serde_json::Value::Null;
        for phase in ["initial", "after-display-change"] {
            if phase != "initial" {
                std::thread::sleep(Duration::from_millis(1200));
                ui(app, |app| unsafe {
                    let w = app.get_webview_window(OVERLAY).unwrap();
                    SendMessageW(
                        HWND(w.hwnd().unwrap().0),
                        WM_DISPLAYCHANGE,
                        Some(WPARAM(32)),
                        Some(LPARAM(0)),
                    );
                });
            }
            for _ in 0..100 {
                observed = ui(app, move |app| {
                    let window = app.get_webview_window(OVERLAY).unwrap();
                    window.eval(r#"{
                    const d=document.querySelector('[role=alertdialog]');
                    let opacity=1;
                    if(d) for(let n=d;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);
                    location.hash=encodeURIComponent(JSON.stringify({phase:PHASE,expiry:true,dialog:!!d,opacity:d?opacity:0,
                        message:d?.innerText.includes('Native expiry regression check')??false}));
                }"#.replace("PHASE", &serde_json::to_string(phase).unwrap())).unwrap();
                    let url = window.url().unwrap();
                    let decoded = url::form_urlencoded::parse(
                        format!("v={}", url.fragment().unwrap_or("")).as_bytes(),
                    )
                    .next()
                    .map(|(_, v)| v.into_owned())
                    .unwrap_or_default();
                    let mut value =
                        serde_json::from_str::<serde_json::Value>(&decoded).unwrap_or_default();
                    if value["phase"] != phase {
                        value = serde_json::Value::Null;
                    }
                    let hwnd = HWND(window.hwnd().unwrap().0);
                    value["nativeVisible"] = unsafe { IsWindowVisible(hwnd).as_bool() }.into();
                    value["prepared"] = POPUP
                        .lock()
                        .unwrap()
                        .as_ref()
                        .is_some_and(|p| p.component == "reminderAlert")
                        .into();
                    value["revealed"] = POPUP
                        .lock()
                        .unwrap()
                        .as_ref()
                        .is_some_and(|p| p.revealed)
                        .into();
                    value
                });
                if observed["nativeVisible"] == true
                    && observed["message"] == true
                    && observed["opacity"].as_f64().unwrap_or(0.) > 0.99
                {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            assert!(
                observed["nativeVisible"] == true
                    && observed["message"] == true
                    && observed["opacity"].as_f64().unwrap_or(0.) > 0.99,
                "Expired reminder never became visible during {phase}: {observed}"
            );
        }
        ui(app, |app| {
            let session = POPUP.lock().unwrap().as_ref().unwrap().id.clone();
            overlay_dismiss(&app, Some(&session));
        });
        std::thread::sleep(Duration::from_secs(2));
        let still_closed = ui(app, |app| {
            let w = app.get_webview_window(OVERLAY).unwrap();
            !unsafe { IsWindowVisible(HWND(w.hwnd().unwrap().0)).as_bool() }
                && POPUP.lock().unwrap().is_none()
        });
        assert!(
            still_closed,
            "Explicitly closing the alert must not reannounce it"
        );
        ui(app, move |app| {
            app.state::<crate::reminders::Reminders>()
                .transition(&id, None, crate::reminders::now())
                .unwrap();
            overlay_hide(&app);
        });
        serde_json::json!({"passed":true,"realTimeout":true,"sharedOverlayInitiallyCold":true,"restoredAfterGeometryInvalidation":true,"explicitCloseStaysClosed":true,"observed":observed})
    }
    std::thread::spawn(move || {
        let report = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            std::thread::sleep(Duration::from_secs(2));
            if std::env::args().any(|arg|arg=="--check-reminder-expiry") { return reminder_expiry(&app); }
            let reserve_cost = reserve_cost(&app);
            let source = ui(&app, |app| app.webview_windows().keys().find(|l| l.starts_with("bar-")).unwrap().clone());
            let opening_window=trace_opening(&app);
            open(&app, source.clone(), "pin-check-cpu", "cpu");
            assert!(ui(&app, |_| IDLE.lock().unwrap().is_empty()),"A replacement WebView was created during the opening animation");
            let opening=read_motion(&app,opening_window,"opening");
            std::fs::write(std::env::temp_dir().join("strata-opening-trace.json"),serde_json::to_vec_pretty(&opening).unwrap()).unwrap();
            for _ in 0..200 {
                if ui(&app, |_| !WINDOWS.lock().unwrap()["pin-check-cpu"].opening) { break; }
                std::thread::sleep(Duration::from_millis(10));
            }
            assert!(ui(&app, |_| !WINDOWS.lock().unwrap()["pin-check-cpu"].opening),"Opening completion was not acknowledged by the actual renderer");
            let frames=opening["frames"].as_array().unwrap();
            let max_opening_gap = frames.windows(2).filter(|pair|
                pair[0]["opacity"].as_f64().unwrap()>0.01 && pair[0]["scaleX"].as_f64().unwrap()<0.999)
                .map(|pair|pair[1]["at"].as_f64().unwrap()-pair[0]["at"].as_f64().unwrap())
                .fold(0.0_f64,f64::max);
            assert!(frames.iter().any(|f|f["nativeTransform"]==true),"Transform still depends on the JS animation loop: {opening}");
            assert!(frames.iter().all(|f|f["clip"]=="none"),"Opening applied a circular reveal mask: {opening}");
            assert!(frames.iter().any(|f|f["opacity"].as_f64().unwrap()>0. && f["scaleX"].as_f64().unwrap()<0.99),"No actual opening expansion was observed: {opening}");
            let cpu_pin_ms = detach(&app, "pin-check-cpu");
            open(&app, source.clone(), "pin-check-gpu", "gpu");
            let gpu_pin_ms = detach(&app, "pin-check-gpu");
            let painted_content = serde_json::json!({"cpu":painted(&app,"pin-check-cpu"),"gpu":painted(&app,"pin-check-gpu")});
            // Exclude cold module/window preparation and the initial opening animation.
            std::thread::sleep(Duration::from_secs(2));
            let continuity = continuity(&app,"pin-check-gpu");
            let return_failure = ui(&app, |app| {
                let label=WINDOWS.lock().unwrap()["pin-check-gpu"].window.clone();
                let popup=app.get_webview_window(&label).unwrap();
                let bar=app.get_webview_window("bar-pinned-check").unwrap();
                let (tx,rx)=mpsc::channel();
                {
                    let mut entries=WINDOWS.lock().unwrap();
                    let entry=entries.get_mut("pin-check-gpu").unwrap();
                    entry.returning=true;entry.generation+=1;entry.completion=Some(tx);
                }
                let generation=WINDOWS.lock().unwrap()["pin-check-gpu"].generation;
                let anchor=Some(OverlayAnchor{x:100.,y:0.,width:40.,height:30.});
                assert!(return_to_anchor(&app,&popup,"pin-check-gpu",anchor,generation).is_err());
                assert!(return_to_anchor(&app,&bar,"pin-check-gpu",anchor,generation-1).is_err());
                assert!(return_to_anchor(&app,&bar,"pin-check-gpu",Some(OverlayAnchor{x:f64::NAN,y:0.,width:40.,height:30.}),generation).is_err());
                assert!(rx.recv_timeout(Duration::from_millis(50)).unwrap().is_err());
                let entries=WINDOWS.lock().unwrap();
                let entry=&entries["pin-check-gpu"];
                assert_eq!(entry.mode,Mode::Pinned);
                assert!(!entry.returning);
                assert!(entry.completion.is_none());
                assert_eq!(entry.window,label);
                assert!(unsafe{IsWindowVisible(HWND(popup.hwnd().unwrap().0)).as_bool()});
                serde_json::json!({"wrongWindowRejected":true,"staleAnchorRejected":true,"invalidAnchorPreservesPinnedWindow":true})
            });
            let initial = ui(&app, |_| local_snapshot());
            assert_eq!(initial.as_array().unwrap().len(),2);
            for window in initial.as_array().unwrap() {
                assert_eq!(window["visible"],true);
                assert_eq!(window["topmost"],true);
                assert_eq!(window["toolWindow"],true);
                assert_eq!(window["noActivate"],false);
                assert_eq!(window["komorebiEligible"],false);
                assert_eq!(window["titleLength"],0);
                assert_eq!(window["appWindow"],false);
                assert_eq!(window["owned"],true);
            }
            let geometry = ui(&app, |app| {
                let label = WINDOWS.lock().unwrap()["pin-check-cpu"].window.clone();
                let other = WINDOWS.lock().unwrap()["pin-check-gpu"].window.clone();
                let window = app.get_webview_window(&label).unwrap();
                let hwnd = HWND(window.hwnd().unwrap().0);
                let mut original_rect = RECT::default();
                unsafe { GetWindowRect(hwnd,&mut original_rect).unwrap(); }
                assert!(drag(&app.get_webview_window(&other).unwrap(),"pin-check-cpu").is_err());
                assert!(dismiss(&app,&window,Some("pin-check-gpu")).is_err());
                assert!(opened(&app,&app.get_webview_window(&other).unwrap(),"pin-check-cpu").is_err());
                let bounds = work_area(hwnd).unwrap();
                let x = bounds.left+180;
                let y = bounds.top+120;
                unsafe { SetWindowPos(hwnd,None,x,y,0,0,SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE).unwrap(); }
                resize(&app,&window,"pin-check-cpu",&OverlaySize { width:320.,height:260. }).unwrap();
                let mut actual = RECT::default();
                unsafe { GetWindowRect(hwnd,&mut actual).unwrap(); }
                assert_eq!((actual.left,actual.top),(x,y));
                // Drive the same monitor visibility policy with an explicit fullscreen signal.
                let monitor = monitor_rect(hwnd).unwrap();
                refresh_for_monitor(&app,Some(monitor));
                assert!(!unsafe { IsWindowVisible(hwnd).as_bool() });
                let foreground = unsafe { GetForegroundWindow() };
                refresh_for_monitor(&app,None);
                assert!(unsafe { IsWindowVisible(hwnd).as_bool() });
                assert_eq!(foreground,unsafe { GetForegroundWindow() });
                let scale=window.scale_factor().unwrap();
                resize(&app,&window,"pin-check-cpu",&OverlaySize {
                    width:(original_rect.right-original_rect.left) as f64 / scale,
                    height:(original_rect.bottom-original_rect.top) as f64 / scale
                }).unwrap();
                serde_json::json!({"actualRect":[actual.left,actual.top,actual.right,actual.bottom],"resizePreservesPosition":true,"crossSessionRejected":true,"fullscreenSignalHidesAndRestoresWithoutFocus":true})
            });
            // A new transient popup does not displace either detached window.
            open(&app,source.clone(),"pin-check-transient","memory");
            painted(&app,"pin-check-cpu");
            painted(&app,"pin-check-gpu");
            assert_eq!(ui(&app, |_| local_snapshot()).as_array().unwrap().len(),2);
            // Return one window while replacing that transient popup.
            let original_cpu = ui(&app, |_| WINDOWS.lock().unwrap()["pin-check-cpu"].window.clone());
            let completion = ui(&app, |app| {
                let label = WINDOWS.lock().unwrap()["pin-check-cpu"].window.clone();
                app.get_webview_window(&label).unwrap().set_focus().unwrap();
                pin(&app,&app.get_webview_window(&label).unwrap(),"pin-check-cpu",false).unwrap()
            });
            completion.recv_timeout(Duration::from_secs(12)).unwrap().unwrap();
            wait_pinned(&app,1);
            assert_eq!(original_cpu,ui(&app, |_| WINDOWS.lock().unwrap()["pin-check-cpu"].window.clone()));
            painted(&app,"pin-check-cpu");
            painted(&app,"pin-check-gpu");
            // An invalid pin must preserve the existing transient content.
            ui(&app, |app| {
                assert!(pin(&app,&app.get_webview_window(&transient_window()).unwrap(),"obsolete-session",true).is_err());
            });
            wait_visible(&app);
            let close_started=std::time::Instant::now();
            let closing_window = ui(&app, |app| {
                let id=transient_id().unwrap();
                let label=WINDOWS.lock().unwrap()[&id].window.clone();
                let window=app.get_webview_window(&label).unwrap();
                dismiss(&app,&window,Some(&id)).unwrap();
                assert!(WINDOWS.lock().unwrap().get(&id).is_some_and(|e|e.mode==Mode::Closing),"Close destroyed the session before its exit animation");
                assert!(unsafe{IsWindowVisible(HWND(window.hwnd().unwrap().0)).as_bool()},"Close hid the HWND before its exit animation");
                label
            });
            std::thread::sleep(Duration::from_millis(50));
            let label=closing_window.clone();
            ui(&app,move |app|app.get_webview_window(&label).unwrap().eval(r#"{
                const d=document.querySelector('[role=dialog]'),frames=[],started=performance.now();
                function sample(){
                    const s=getComputedStyle(d.parentElement),m=new DOMMatrixReadOnly(s.transform);
                    const nativeTransform=d.parentElement.getAnimations().some(a=>a.playState==='running' && a.effect?.getKeyframes().some(k=>k.transform));
                    frames.push({at:performance.now()-started,scaleX:m.m11,scaleY:m.m22,nativeTransform});
                    if(performance.now()-started>=120)location.hash=encodeURIComponent(JSON.stringify({motion:'closing',scaleX:Math.min(...frames.map(f=>f.scaleX)),scaleY:Math.min(...frames.map(f=>f.scaleY)),inert:!!d.closest('[inert]'),frames}));
                    else requestAnimationFrame(sample);
                }requestAnimationFrame(sample);
            }"#).unwrap());
            let closing=read_motion(&app,closing_window.clone(),"closing");
            assert_eq!(closing["inert"],true);
            assert!(closing["frames"].as_array().unwrap().iter().any(|f|f["nativeTransform"]==true),"Exit transform is still JS-driven");
            assert!(closing["scaleX"].as_f64().unwrap()<0.99,"No exit contraction was observed: {closing}");
            for _ in 0..200 {
                let label=closing_window.clone();
                if ui(&app,move |app|app.get_webview_window(&label).is_some_and(|w| !unsafe { IsWindowVisible(HWND(w.hwnd().unwrap().0)).as_bool() })) { break; }
                std::thread::sleep(Duration::from_millis(5));
            }
            let label=closing_window.clone();
            assert!(ui(&app,move |app|app.get_webview_window(&label).is_some_and(|w| !unsafe { IsWindowVisible(HWND(w.hwnd().unwrap().0)).as_bool() })),"Exit completion never returned its HWND to the idle pool");
            let close_ms=close_started.elapsed().as_millis();
            assert!(close_ms>=200 && close_ms<900,"Exit did not use renderer acknowledgment: {close_ms} ms");
            // Exercise the regression the pin-only timing deliberately excludes:
            // first content and repeated switches on real, reused WebViews.
            ui(&app, |app| {
                let ids: Vec<_> = WINDOWS.lock().unwrap().keys().cloned().collect();
                for id in ids { close(&app, &id); }
            });
            let mut reopenings = Vec::new();
            let before = NEXT.load(Ordering::Relaxed);
            let mut reused = None;
            for (id, component) in [
                ("reuse-cpu-1", "cpu"), ("reuse-gpu", "gpu"),
                ("reuse-reminders", "reminders"), ("reuse-cpu-2", "cpu")
            ] {
                let started = std::time::Instant::now();
                open(&app, source.clone(), id, component);
                let visible_ms = started.elapsed().as_millis();
                let label = ui(&app, move |_| WINDOWS.lock().unwrap()[id].window.clone());
                if let Some(previous) = &reused { assert_eq!(previous, &label, "Widget switch replaced the warm document"); }
                reused = Some(label.clone());
                let mut content = painted(&app, id);
                let text = content["text"].as_str().unwrap();
                assert!(!text.contains("Reminders require"), "Reminder authorization failed: {text}");
                assert!(!text.contains("Carregando"), "Artificial loading was painted: {text}");
                assert_eq!(content["firstContent"]["session"], id, "Opening trace belongs to an old lease");
                let first_content_ms = content["firstContent"]["firstAt"].as_f64().unwrap() - OPEN_STARTED.lock().unwrap()[id];
                assert!(first_content_ms >= 0., "Opening measurement predates the click");
                assert_eq!(content["firstContent"]["loading"], false, "A loading state appeared before useful content: {content}");
                if component == "reminders" { content["text"] = "[reminders content omitted]".into(); }
                let target = label.clone();
                ui(&app, move |app| {
                    let w = app.get_webview_window(&target).unwrap();
                    assert!(crate::reminders::authorize(&w).is_ok());
                    // A previous lease cannot resize a reused HWND.
                    assert!(resize(&app, &w, "pin-check-cpu", &OverlaySize { width:300.,height:200. }).is_err());
                });
                reopenings.push(serde_json::json!({"component":component,"window":label,"clickToVisibleMs":visible_ms,"clickToFirstContentMs":first_content_ms,"content":content}));
            }
            assert_eq!(NEXT.load(Ordering::Relaxed), before, "Widget switches constructed another WebView");
            ui(&app, |app| {
                close_transient(&app, None);
                assert!(WINDOWS.lock().unwrap().is_empty());
                assert!(IDLE.lock().unwrap().len() <= MAX_IDLE_HOSTS);
                assert_eq!(app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"], 0, "Idle hosts retained resource subscriptions");
                for label in IDLE.lock().unwrap().iter().cloned().collect::<Vec<_>>() {
                    assert!(!active_window(&label));
                    let w = app.get_webview_window(&label).unwrap();
                    assert!(crate::reminders::authorize(&w).is_err(), "Idle reserve retained content privileges");
                }
            });
            ui(&app, |app| {
                overlay_hide(&app);
                release_all(&app);
            });
            wait_pinned(&app,0);
            serde_json::json!({"passed":true,"reopenings":reopenings,"reusesWarmHost":true,"idleHostLimit":2,"idleAuthorizationRejected":true,"maxMainThreadFrameGapMs":max_opening_gap,"compositorTransformVerified":true,"reserveDeferredUntilOpeningFinishes":true,"opening":opening,"closing":closing,"exitAcknowledgmentMs":close_ms,"pinReadyMs":{"cpu":cpu_pin_ms,"gpu":gpu_pin_ms},"sameWindowInBothDirections":true,"continuity":continuity,"reserveCost":reserve_cost,"returnFailure":return_failure,"initial":initial,"painted":painted_content,"paintSurvivesOtherPopupEvents":true,"geometry":geometry,"multiplePinned":true,"transientAlongsidePinned":true,"returnReplacesTransient":true,"failedTransferPreservesOriginal":true,"cleanup":true,"limits":["Actual pointer dragging, mixed-DPI movement, monitor unplug and external fullscreen application require a manual acceptance run."]})
        })).unwrap_or_else(|error| serde_json::json!({"passed":false,"error":error.downcast_ref::<String>().cloned().or_else(||error.downcast_ref::<&str>().map(|s|s.to_string())).unwrap_or("Pinned check panicked".into())}));
        let _ = std::fs::write(
            std::env::temp_dir().join("strata-pinned-check.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        );
        app.exit(if report["passed"] == true { 0 } else { 1 });
    });
}

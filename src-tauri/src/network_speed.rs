//! Bounded native estimate against Cloudflare's documented transfer endpoints.
//! Payload handed to the HTTP transport counts toward the upload budget even on failure.
use crate::{network::Network, network_contract::NetworkTestPhase as Phase, network_windows};
use std::{
    io::{self, Read},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
const STAGE_BYTES: u64 = 250_000_000;
const TEST_SECONDS: u64 = 30;
const STAGE_SECONDS: u64 = 15;
const CONNECTIONS: u64 = 4;
const MAX_REQUEST_BYTES: u64 = 8_000_000;
struct Upload {
    left: u64,
    total: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
    deadline: Instant,
}
impl Read for Upload {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if self.cancel.load(Ordering::Relaxed) || Instant::now() >= self.deadline {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionAborted,
                "Teste interrompido",
            ));
        }
        let count = buffer.len().min(self.left as usize);
        buffer[..count].fill(0);
        self.left -= count as u64;
        self.total.fetch_add(count as u64, Ordering::Relaxed);
        Ok(count)
    }
}
fn active(cancel: &AtomicBool, deadline: Instant) -> bool {
    !cancel.load(Ordering::Relaxed) && Instant::now() < deadline
}
fn rate(bytes: u64, elapsed: Duration) -> Option<f64> {
    (bytes > 0 && elapsed.as_secs_f64() >= 0.25)
        .then(|| bytes as f64 * 8. / elapsed.as_secs_f64() / 1_000_000.)
}
fn sample_limited(elapsed: Duration, measured: Option<f64>, failed_early: bool) -> bool {
    elapsed < Duration::from_secs(2) || measured.is_none() || failed_early
}
fn stage_progress(bytes: u64, elapsed: Duration, budget: Duration) -> f64 {
    (bytes as f64 / STAGE_BYTES as f64)
        .max(elapsed.as_secs_f64() / budget.as_secs_f64().max(f64::EPSILON))
        .clamp(0., 1.)
}
pub fn run(owner: Network, cancel: Arc<AtomicBool>, interface_index: u32) {
    run_observed(
        cancel,
        interface_index,
        |phase, bytes, elapsed, rate, limited, error, progress| {
            owner.test_update(phase, bytes, elapsed, rate, limited, error, progress)
        },
    );
}
fn run_observed(
    cancel: Arc<AtomicBool>,
    interface_index: u32,
    update: impl Fn(Phase, f64, f64, Option<f64>, bool, Option<String>, f64),
) {
    let start = Instant::now();
    let deadline = start + Duration::from_secs(TEST_SECONDS);
    let client = match reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(2))
        .user_agent("Strata/0.1 network-estimate")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            update(
                Phase::Error,
                0.,
                0.,
                None,
                false,
                Some(error.to_string()),
                0.,
            );
            return;
        }
    };
    let mut base = 0u64;
    for upload in [false, true] {
        if !active(&cancel, deadline) {
            break;
        }
        let stage_start = Instant::now();
        let stage_deadline = (stage_start + Duration::from_secs(STAGE_SECONDS)).min(deadline);
        let bytes = Arc::new(AtomicU64::new(0));
        let measured_bytes = Arc::new(AtomicU64::new(0));
        let done = Arc::new(AtomicU64::new(0));
        let mut workers = Vec::new();
        for _ in 0..CONNECTIONS {
            let (client, bytes, measured_bytes, cancel, done) = (
                client.clone(),
                bytes.clone(),
                measured_bytes.clone(),
                cancel.clone(),
                done.clone(),
            );
            workers.push(std::thread::spawn(move || {
                let outcome = transfer(
                    &client,
                    upload,
                    bytes,
                    measured_bytes,
                    cancel,
                    stage_deadline,
                    STAGE_BYTES / CONNECTIONS,
                    if upload {
                        "https://speed.cloudflare.com/__up"
                    } else {
                        "https://speed.cloudflare.com/__down"
                    },
                );
                done.fetch_add(1, Ordering::Release);
                outcome
            }));
        }
        while done.load(Ordering::Acquire) < CONNECTIONS {
            if network_windows::default_index() != Some(interface_index) {
                cancel.store(true, Ordering::Relaxed);
            }
            let count = bytes.load(Ordering::Relaxed);
            update(
                if upload {
                    Phase::Upload
                } else {
                    Phase::Download
                },
                (base + count) as f64,
                start.elapsed().as_millis() as f64,
                rate(
                    measured_bytes.load(Ordering::Relaxed),
                    stage_start.elapsed(),
                ),
                false,
                None,
                stage_progress(
                    count,
                    stage_start.elapsed(),
                    stage_deadline.duration_since(stage_start),
                ),
            );
            std::thread::sleep(Duration::from_millis(250));
        }
        let errors: Vec<_> = workers
            .into_iter()
            .filter_map(|worker| match worker.join() {
                Ok(Ok(())) => None,
                Ok(Err(e)) => Some(e),
                Err(_) => Some("Worker do teste encerrado".into()),
            })
            .collect();
        let count = bytes.load(Ordering::Relaxed);
        base += count;
        let measured = rate(
            measured_bytes.load(Ordering::Relaxed),
            stage_start.elapsed(),
        );
        let limited = sample_limited(
            stage_start.elapsed(),
            measured,
            !errors.is_empty() && Instant::now() < stage_deadline,
        );
        // A transport failure before either budget is exhausted is not a completed stage.
        if !errors.is_empty()
            && count < STAGE_BYTES
            && Instant::now() < stage_deadline
            && !cancel.load(Ordering::Relaxed)
        {
            update(
                Phase::Error,
                base as f64,
                start.elapsed().as_millis() as f64,
                None,
                true,
                Some(transfer_errors(&errors)),
                stage_progress(
                    count,
                    stage_start.elapsed(),
                    stage_deadline.duration_since(stage_start),
                ),
            );
            return;
        }
        update(
            if upload {
                Phase::Upload
            } else {
                Phase::Download
            },
            base as f64,
            start.elapsed().as_millis() as f64,
            measured,
            limited,
            None,
            1.,
        );
        if measured.is_none() && !cancel.load(Ordering::Relaxed) {
            update(
                Phase::Error,
                base as f64,
                start.elapsed().as_millis() as f64,
                None,
                true,
                Some(transfer_errors(&errors)),
                0.,
            );
            return;
        }
    }
    update(
        if cancel.load(Ordering::Relaxed) {
            Phase::Cancelled
        } else {
            Phase::Complete
        },
        base as f64,
        start.elapsed().as_millis() as f64,
        None,
        false,
        None,
        1.,
    );
}
fn transfer_errors(errors: &[String]) -> String {
    match errors.first() {
        Some(first) if errors.len() > 1 => format!("{first} ({} conexões falharam.)", errors.len()),
        Some(first) => first.clone(),
        None => "A transferência terminou sem uma amostra válida.".into(),
    }
}
fn checked_response(
    response: reqwest::blocking::Response,
    upload: bool,
) -> Result<reqwest::blocking::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let stage = if upload { "upload" } else { "download" };
    let ray = response
        .headers()
        .get("cf-ray")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("indisponível");
    let challenge = response
        .headers()
        .get("cf-mitigated")
        .and_then(|v| v.to_str().ok())
        == Some("challenge");
    Err(format!(
        "Cloudflare recusou o {stage}: HTTP {status}. Ray ID: {ray}.{}",
        if challenge {
            " O servidor exige verificação de navegador."
        } else {
            ""
        }
    ))
}
fn transfer(
    client: &reqwest::blocking::Client,
    upload: bool,
    bytes: Arc<AtomicU64>,
    measured_bytes: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
    deadline: Instant,
    budget: u64,
    endpoint: &str,
) -> Result<(), String> {
    let mut remaining = budget;
    let mut size = 64_000u64;
    while remaining > 0 && active(&cancel, deadline) {
        let count = size.min(remaining);
        let timeout = deadline.saturating_duration_since(Instant::now());
        if timeout.is_zero() {
            break;
        }
        if upload {
            let body = Upload {
                left: count,
                total: bytes.clone(),
                cancel: cancel.clone(),
                deadline,
            };
            client
                .post(endpoint)
                .timeout(timeout)
                .body(reqwest::blocking::Body::sized(body, count))
                .send()
                .map_err(|e| format!("Falha no upload: {e}"))
                .and_then(|response| checked_response(response, true))?;
            measured_bytes.fetch_add(count, Ordering::Relaxed);
        } else {
            let mut response = client
                .get(endpoint)
                .query(&[("bytes", count)])
                .header(reqwest::header::CACHE_CONTROL, "no-cache")
                .timeout(timeout)
                .send()
                .map_err(|e| format!("Falha no download: {e}"))
                .and_then(|response| checked_response(response, false))?;
            let mut left = count;
            let mut buffer = [0u8; 32 * 1024];
            while left > 0 && active(&cancel, deadline) {
                let length = buffer.len().min(left as usize);
                let read = match response.read(&mut buffer[..length]) {
                    Ok(read) => read,
                    Err(_) if !active(&cancel, deadline) => return Ok(()),
                    Err(error) => return Err(format!("Falha ao ler o download: {error:?}")),
                };
                if read == 0 {
                    return Err("Resposta de download incompleta".into());
                }
                bytes.fetch_add(read as u64, Ordering::Relaxed);
                measured_bytes.fetch_add(read as u64, Ordering::Relaxed);
                left -= read as u64;
            }
        }
        remaining -= count;
        size = (size * 2).min(MAX_REQUEST_BYTES);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normal_budget_completion_is_not_an_insufficient_sample() {
        assert!(!sample_limited(Duration::from_secs(5), Some(400.), false));
        assert!(!sample_limited(Duration::from_secs(15), Some(80.), false));
        assert!(sample_limited(Duration::from_secs(1), Some(2000.), false));
        assert!(sample_limited(Duration::from_secs(15), None, false));
        assert!(sample_limited(Duration::from_secs(5), Some(400.), true));
    }
    #[test]
    fn download_deadline_keeps_partial_bytes_without_a_body_error() {
        use std::{io::Write, net::TcpListener};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048];
            stream.read(&mut request).unwrap();
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 64000\r\nConnection: close\r\n\r\n0123456789").unwrap();
            std::thread::sleep(Duration::from_millis(300));
        });
        let bytes = Arc::new(AtomicU64::new(0));
        let measured = Arc::new(AtomicU64::new(0));
        let client = reqwest::blocking::Client::new();
        let result = transfer(
            &client,
            false,
            bytes.clone(),
            measured.clone(),
            Arc::new(AtomicBool::new(false)),
            Instant::now() + Duration::from_millis(150),
            64_000,
            &endpoint,
        );
        server.join().unwrap();
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(bytes.load(Ordering::Relaxed), 10);
        assert_eq!(measured.load(Ordering::Relaxed), 10);
    }
    #[test]
    fn progressive_download_stays_within_accepted_request_size() {
        use std::{io::Write, net::TcpListener};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let budget = 40_000_000;
        let server = std::thread::spawn(move || {
            let mut received = 0;
            while received < budget {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut byte = [0];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                let text = String::from_utf8(request).unwrap();
                let count: u64 = text
                    .split("bytes=")
                    .nth(1)
                    .unwrap()
                    .split_whitespace()
                    .next()
                    .unwrap()
                    .parse()
                    .unwrap();
                if count > 8_000_000 {
                    stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                    return received;
                }
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {count}\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
                let buffer = [0; 32768];
                let mut left = count;
                while left > 0 {
                    let length = left.min(buffer.len() as u64) as usize;
                    stream.write_all(&buffer[..length]).unwrap();
                    left -= length as u64;
                }
                received += count;
            }
            received
        });
        let bytes = Arc::new(AtomicU64::new(0));
        let result = transfer(
            &reqwest::blocking::Client::new(),
            false,
            bytes.clone(),
            Arc::new(AtomicU64::new(0)),
            Arc::new(AtomicBool::new(false)),
            Instant::now() + Duration::from_secs(10),
            budget,
            &endpoint,
        );
        let served = server.join().unwrap();
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(served, budget);
        assert_eq!(bytes.load(Ordering::Relaxed), budget);
    }
    #[test]
    fn forbidden_reports_stage_and_provider_diagnostics() {
        use std::{io::Write, net::TcpListener};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048];
            stream.read(&mut request).unwrap();
            stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nCF-Ray: test-ray\r\nCF-Mitigated: challenge\r\nConnection: close\r\n\r\n").unwrap();
        });
        let response = reqwest::blocking::get(endpoint).unwrap();
        let error = checked_response(response, true).unwrap_err();
        assert!(error.contains("upload: HTTP 403 Forbidden"));
        assert!(error.contains("Ray ID: test-ray"));
        assert!(error.contains("verificação de navegador"));
        server.join().unwrap();
    }
    #[test]
    #[ignore = "Live diagnostic: downloads at most 40 MB and uploads 64 KB to fixed Cloudflare endpoints"]
    fn live_bounded_requests() {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .user_agent("Strata/0.1 network-estimate")
            .build()
            .unwrap();
        for upload in [false, true] {
            let result = transfer(
                &client,
                upload,
                Arc::new(AtomicU64::new(0)),
                Arc::new(AtomicU64::new(0)),
                Arc::new(AtomicBool::new(false)),
                Instant::now() + Duration::from_secs(10),
                if upload { 64_000 } else { 40_000_000 },
                if upload {
                    "https://speed.cloudflare.com/__up"
                } else {
                    "https://speed.cloudflare.com/__down"
                },
            );
            println!(
                "{}: {:?}",
                if upload { "upload" } else { "download" },
                result
            );
            assert!(result.is_ok());
        }
    }
    #[test]
    fn progress_uses_current_stage_budget() {
        assert_eq!(
            stage_progress(0, Duration::ZERO, Duration::from_secs(15)),
            0.
        );
        assert_eq!(
            stage_progress(125_000_000, Duration::from_secs(1), Duration::from_secs(15)),
            0.5
        );
        assert_eq!(
            stage_progress(1, Duration::from_millis(7500), Duration::from_secs(15)),
            0.5
        );
        assert_eq!(
            stage_progress(1, Duration::from_secs(5), Duration::from_secs(10)),
            0.5
        );
        assert_eq!(
            stage_progress(
                300_000_000,
                Duration::from_secs(20),
                Duration::from_secs(15)
            ),
            1.
        );
    }
    #[test]
    fn upload_is_bounded_and_cancellable() {
        let total = Arc::new(AtomicU64::new(0));
        let cancel = Arc::new(AtomicBool::new(false));
        let mut body = Upload {
            left: 10,
            total: total.clone(),
            cancel: cancel.clone(),
            deadline: Instant::now() + Duration::from_secs(1),
        };
        let mut buffer = [0u8; 8];
        assert_eq!(body.read(&mut buffer).unwrap(), 8);
        assert_eq!(body.read(&mut buffer).unwrap(), 2);
        assert_eq!(body.read(&mut buffer).unwrap(), 0);
        assert_eq!(total.load(Ordering::Relaxed), 10);
        cancel.store(true, Ordering::Relaxed);
        assert!(body.read(&mut buffer).is_err());
    }
    #[test]
    fn http_error_and_download_budget_are_enforced() {
        use std::io::Write;
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            for status in [
                "200 OK",
                "503 Service Unavailable",
                "503 Service Unavailable",
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 2048];
                let _ = stream.read(&mut request);
                write!(stream,"HTTP/1.1 {status}\r\nContent-Length: 20\r\nConnection: close\r\n\r\n01234567890123456789").unwrap();
            }
        });
        let client = reqwest::blocking::Client::new();
        let bytes = Arc::new(AtomicU64::new(0));
        let cancel = Arc::new(AtomicBool::new(false));
        transfer(
            &client,
            false,
            bytes.clone(),
            Arc::new(AtomicU64::new(0)),
            cancel.clone(),
            Instant::now() + Duration::from_secs(3),
            10,
            &endpoint,
        )
        .unwrap();
        assert_eq!(bytes.load(Ordering::Relaxed), 10);
        assert!(transfer(
            &client,
            false,
            bytes.clone(),
            Arc::new(AtomicU64::new(0)),
            cancel,
            Instant::now() + Duration::from_secs(3),
            10,
            &endpoint
        )
        .is_err());
        assert_eq!(bytes.load(Ordering::Relaxed), 10);
        let uploaded = Arc::new(AtomicU64::new(0));
        let acknowledged = Arc::new(AtomicU64::new(0));
        assert!(transfer(
            &client,
            true,
            uploaded.clone(),
            acknowledged.clone(),
            Arc::new(AtomicBool::new(false)),
            Instant::now() + Duration::from_secs(3),
            10,
            &endpoint
        )
        .is_err());
        assert!(uploaded.load(Ordering::Relaxed) <= 10);
        assert_eq!(acknowledged.load(Ordering::Relaxed), 0);
        server.join().unwrap();
    }
    #[test]
    #[ignore = "Explicit Cloudflare acceptance; transfers up to 500 MB and records a new temporary evidence file"]
    fn live_cloudflare_acceptance() {
        let index = network_windows::default_index().expect("Default route");
        let observations = std::sync::Mutex::new(Vec::new());
        run_observed(
            Arc::new(AtomicBool::new(false)),
            index,
            |phase, bytes, elapsed, rate, limited, error, progress| {
                observations.lock().unwrap().push(serde_json::json!({"phase":phase,"bytes":bytes,"elapsedMs":elapsed,"rateMbps":rate,"stageProgress":progress,"limited":limited,"error":error}));
            },
        );
        let observations = observations.into_inner().unwrap();
        let last = observations.last().unwrap();
        let evidence = serde_json::json!({"timestamp":crate::metrics::timestamp() as f64,"observations":observations});
        let path = std::env::temp_dir().join(format!(
            "strata-network-speed-{}.json",
            crate::metrics::timestamp()
        ));
        std::fs::write(&path, serde_json::to_string_pretty(&evidence).unwrap()).unwrap();
        println!("Evidence: {}", path.display());
        assert_eq!(last["phase"], "complete");
        assert!(last["bytes"].as_f64().unwrap() <= 500_000_000.);
        assert!(last["elapsedMs"].as_f64().unwrap() < 31_000.);
        for phase in ["download", "upload"] {
            assert!(observations
                .iter()
                .any(|p| p["phase"] == phase && p["rateMbps"].as_f64().is_some_and(|v| v > 0.)));
        }
    }
    #[test]
    fn quotas_and_rates() {
        assert_eq!(STAGE_BYTES * 2, 500_000_000);
        assert_eq!(STAGE_BYTES / CONNECTIONS * CONNECTIONS, STAGE_BYTES);
        assert_eq!(rate(1_000_000, Duration::from_secs(1)), Some(8.));
        assert_eq!(rate(0, Duration::from_secs(1)), None);
    }
}

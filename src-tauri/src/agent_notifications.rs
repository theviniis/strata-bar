use crate::agents_contract::{AgentAlert, AgentNotificationStatus, AgentNotificationsSnapshot};
use std::sync::{mpsc, Arc, Mutex};

#[derive(Clone)]
pub struct Queue {
    sender: mpsc::SyncSender<Option<AgentAlert>>,
    state: Arc<Mutex<AgentNotificationsSnapshot>>,
}

impl Queue {
    pub fn enqueue(&self, alerts: Vec<AgentAlert>) {
        for alert in alerts {
            if self.sender.try_send(Some(alert)).is_err() {
                if let Ok(mut state) = self.state.lock() {
                    state.skipped = state.skipped.saturating_add(1);
                }
            }
        }
    }

    pub fn snapshot(&self) -> AgentNotificationsSnapshot {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or(AgentNotificationsSnapshot {
                status: AgentNotificationStatus::Error,
                skipped: 0,
            })
    }
}

pub struct Notifications {
    pub queue: Queue,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Notifications {
    pub fn start() -> std::io::Result<Self> {
        Self::start_with(crate::agent_notifications_windows::submit)
    }

    fn start_with(
        mut transport: impl FnMut(Option<&AgentAlert>) -> AgentNotificationStatus + Send + 'static,
    ) -> std::io::Result<Self> {
        let (sender, receiver) = mpsc::sync_channel::<Option<AgentAlert>>(32);
        let state = Arc::new(Mutex::new(AgentNotificationsSnapshot::default()));
        let worker_state = state.clone();
        let worker = std::thread::Builder::new()
            .name("strata-agent-toasts".into())
            .spawn(move || {
                let initial = transport(None);
                if let Ok(mut state) = worker_state.lock() {
                    state.status = initial;
                }
                while let Ok(Some(alert)) = receiver.recv() {
                    let outcome = transport(Some(&alert));
                    if let Ok(mut state) = worker_state.lock() {
                        state.status = outcome;
                    }
                }
            })?;
        Ok(Self {
            queue: Queue { sender, state },
            worker: Mutex::new(Some(worker)),
        })
    }

    pub fn stop(&self) {
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = self.queue.sender.send(None);
                let _ = worker.join();
            }
        }
    }
}

impl Drop for Notifications {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents_contract::{AgentAlertKind, AgentType};

    #[test]
    fn a_slow_os_does_not_block_the_service_and_reports_queue_overflow() {
        let (entered, started) = mpsc::channel();
        let (release, permit) = mpsc::channel();
        let notifications = Notifications::start_with(move |alert| {
            if alert.is_some() {
                entered.send(()).unwrap();
                permit.recv().unwrap();
            }
            AgentNotificationStatus::Ready
        })
        .unwrap();
        let alert = AgentAlert {
            id: "agent-alert-1".into(),
            agent: AgentType::Antigravity,
            session_id: "session".into(),
            session_title: "Title".into(),
            kind: AgentAlertKind::Completed,
            created_at: 1000.0,
        };
        notifications.queue.enqueue(vec![alert.clone()]);
        started
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        notifications.queue.enqueue(vec![alert; 33]);
        let skipped = notifications.queue.snapshot().skipped;
        for _ in 0..33 {
            release.send(()).unwrap();
        }
        notifications.stop();
        assert_eq!(skipped, 1);
        assert_eq!(started.try_iter().count(), 32);
    }

    #[test]
    fn failed_native_delivery_is_reported_without_automatic_retry() {
        let (sent, received) = mpsc::channel();
        let notifications = Notifications::start_with(move |alert| {
            if let Some(alert) = alert {
                sent.send(alert.id.clone()).unwrap();
                AgentNotificationStatus::Blocked
            } else {
                AgentNotificationStatus::Ready
            }
        })
        .unwrap();
        notifications.queue.enqueue(vec![AgentAlert {
            id: "agent-alert-1".into(),
            agent: AgentType::Opencode,
            session_id: "session".into(),
            session_title: "Private title".into(),
            kind: AgentAlertKind::Attention,
            created_at: 1000.0,
        }]);
        notifications.stop();
        assert_eq!(
            received.try_iter().collect::<Vec<_>>(),
            vec!["agent-alert-1"]
        );
        assert_eq!(
            notifications.queue.snapshot().status,
            AgentNotificationStatus::Blocked
        );
    }
}

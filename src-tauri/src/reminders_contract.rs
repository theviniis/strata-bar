use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReminderMode {
    Duration { seconds: u32 },
    DateTime,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ReminderStatus {
    Scheduled,
    Ringing,
    Dismissed,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub enum SnoozeOption {
    #[serde(rename = "5")]
    Five,
    #[serde(rename = "10")]
    Ten,
    #[serde(rename = "15")]
    Fifteen,
    #[serde(rename = "30")]
    Thirty,
}

impl SnoozeOption {
    pub fn minutes(&self) -> u32 {
        match self {
            Self::Five => 5,
            Self::Ten => 10,
            Self::Fifteen => 15,
            Self::Thirty => 30,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reminder {
    pub id: String,
    pub message: String,
    pub mode: ReminderMode,
    pub original_at: f64,
    pub notify_at: f64,
    pub event_duration_seconds: u32,
    pub status: ReminderStatus,
    pub created_at: f64,
    pub updated_at: f64,
    pub google_event_id: Option<String>,
    #[serde(default)]
    pub calendar_requested: bool,
    pub calendar_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateReminder {
    pub message: String,
    pub mode: ReminderMode,
    pub scheduled_at: Option<f64>,
    pub event_duration_seconds: Option<u32>,
    #[ts(optional)]
    pub sync_calendar: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReminderSnapshot {
    pub version: u32,
    pub revision: u32,
    pub reminders: Vec<Reminder>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CalendarStatus {
    pub connected: bool,
    pub connecting: bool,
    pub error: Option<String>,
}

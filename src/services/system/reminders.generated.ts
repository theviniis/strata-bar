// Generated from Rust reminders_contract.rs by cargo build. Do not edit.
export type ReminderMode = { "type": "duration", seconds: number, } | { "type": "dateTime" };
export type ReminderStatus = "scheduled" | "ringing" | "dismissed";
export type SnoozeOption = "5" | "10" | "15" | "30";
export type Reminder = { id: string, message: string, mode: ReminderMode, originalAt: number, notifyAt: number, eventDurationSeconds: number, status: ReminderStatus, createdAt: number, updatedAt: number, googleEventId: string | null, calendarRequested: boolean, calendarError: string | null, };
export type CreateReminder = { message: string, mode: ReminderMode, scheduledAt: number | null, eventDurationSeconds: number | null, syncCalendar?: boolean, };
export type ReminderSnapshot = { version: number, revision: number, reminders: Array<Reminder>, };
export type CalendarStatus = { connected: boolean, connecting: boolean, error: string | null, };

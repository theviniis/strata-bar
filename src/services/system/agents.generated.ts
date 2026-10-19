// Generated from Rust agents_contract.rs by cargo build. Do not edit.
export type AgentType = "chatgpt" | "opencode" | "antigravity";
export type AgentAlertKind = "attention" | "completed";
export type AgentAlert = { id: string, agent: AgentType, sessionId: string, sessionTitle: string, kind: AgentAlertKind, createdAt: number, };
export type AgentAlertsSnapshot = { items: Array<AgentAlert>, overflowCount: number, paused: boolean, };
export type AgentNotificationStatus = "checking" | "ready" | "blocked" | "unavailable" | "error" | "demo";
export type AgentNotificationsSnapshot = { status: AgentNotificationStatus, skipped: number, };
export type AgentTextField = { key: string, title: string, description: string | null, required: boolean, minLength: number | null, maxLength: number | null, };
export type AgentMessage = { id: string, sessionId: string, connectionId: string, version: string, title: string, fields: Array<AgentTextField>, unsupportedReason: string | null, replyBlocked: boolean, };
export type AgentReplyRequest = { sessionId: string, questionId: string, version: string, answers: { [key in string]?: string }, };
export type AgentPermission = { id: string, sessionId: string, version: string, action: string, resources: Array<string>, details: string, unsupportedReason: string | null, replyBlocked: boolean, };
export type AgentPermissionDecision = "approveOnce" | "reject";
export type AgentPermissionRequest = { sessionId: string, permissionId: string, version: string, decision: AgentPermissionDecision, };
export type InitialPromptStatus = "notRequested" | "accepted" | "notSent" | "unknown";
export type CreateAgentSessionResult = { sessionId: string, promptStatus: InitialPromptStatus, error: string | null, };
export type AgentApplication = { agent: AgentType, 
/**
 * None means enumeration failed; false means no matching process was found.
 */
running: boolean | null, };
export type SessionStatus = "processing" | "attention" | "completed" | "error" | "idle" | "unknown" | "disconnected";
export type AgentSession = { id: string, agent: AgentType, connectionId: string, title: string, directory: string, status: SessionStatus, updatedAt: number, };
export type AgentConnectionStatus = "disabled" | "connecting" | "connected" | "disconnected";
export type OpenCodeSnapshot = { status: AgentConnectionStatus, sessions: Array<AgentSession>, hasMore: boolean, questions: Array<AgentMessage>, permissions: Array<AgentPermission>, completedTurns: { [key in string]?: number }, error: string | null, };
export type AntigravitySnapshot = { status: AgentConnectionStatus, sessions: Array<AgentSession>, error: string | null, };
export type AgentsSnapshot = { version: number, revision: number, observedAt: number, applications: Array<AgentApplication>, error: string | null, opencode: OpenCodeSnapshot, antigravity: AntigravitySnapshot, alerts: AgentAlertsSnapshot, notifications: AgentNotificationsSnapshot, };

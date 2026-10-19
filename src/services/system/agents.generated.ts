// Generated from Rust agents_contract.rs by cargo build. Do not edit.
export type AgentType = "chatgpt" | "opencode" | "antigravity";
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
export type OpenCodeSnapshot = { status: AgentConnectionStatus, sessions: Array<AgentSession>, hasMore: boolean, error: string | null, };
export type AntigravitySnapshot = { status: AgentConnectionStatus, sessions: Array<AgentSession>, error: string | null, };
export type AgentsSnapshot = { version: number, revision: number, observedAt: number, applications: Array<AgentApplication>, error: string | null, opencode: OpenCodeSnapshot, antigravity: AntigravitySnapshot, };

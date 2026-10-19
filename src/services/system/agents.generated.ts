// Generated from Rust agents_contract.rs by cargo build. Do not edit.
export type AgentType = "chatgpt" | "opencode" | "antigravity";
export type AgentApplication = { agent: AgentType, 
/**
 * None means enumeration failed; false means no matching process was found.
 */
running: boolean | null, };
export type AgentsSnapshot = { version: number, revision: number, observedAt: number, applications: Array<AgentApplication>, error: string | null, };

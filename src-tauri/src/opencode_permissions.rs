use super::{execute_cli, installed_cli, read_cli, valid_id, ReadRequest};
use crate::agents_contract::{AgentPermission, AgentPermissionDecision, AgentPermissionRequest};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

fn invalid() -> String {
    "Permissão incompatível com a API OpenCode v2".into()
}

pub fn project(value: &Value, session_id: &str) -> Result<AgentPermission, String> {
    let id = value["id"]
        .as_str()
        .filter(|id| {
            id.starts_with("per")
                && id.len() > 3
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
        })
        .ok_or_else(invalid)?;
    if !valid_id(session_id) || value["sessionID"].as_str() != Some(session_id) {
        return Err(invalid());
    }
    let action = value["action"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(invalid)?;
    let raw_resources = value["resources"].as_array().ok_or_else(invalid)?;
    let mut unsupported = action.len() > 256
        || raw_resources.len() > 32
        || raw_resources
            .iter()
            .any(|v| v.as_str().is_none_or(|s| s.len() > 4096));
    let mut resources: Vec<String> = if unsupported {
        Vec::new()
    } else {
        raw_resources
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect()
    };
    if resources.iter().map(String::len).sum::<usize>() > 16384 {
        unsupported = true;
        resources.clear();
    }
    let mut context = serde_json::Map::new();
    for key in ["metadata", "source", "message", "save"] {
        if let Some(data) = value.get(key) {
            context.insert(key.into(), data.clone());
        }
    }
    let details = serde_json::to_string(&context).map_err(|_| invalid())?;
    unsupported |= details.len() > 16384
        || value.as_object().is_none_or(|map| {
            map.keys().any(|key| {
                ![
                    "id",
                    "sessionID",
                    "action",
                    "resources",
                    "metadata",
                    "source",
                    "message",
                    "save",
                ]
                .contains(&key.as_str())
            })
        });
    let version = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).map_err(|_| invalid())?)
    );
    Ok(AgentPermission {
        id: id.into(),
        session_id: session_id.into(),
        version,
        action: if action.len() <= 256 {
            action.into()
        } else {
            "Operação excede o limite de exibição".into()
        },
        resources,
        details: if details.len() <= 16384 {
            details
        } else {
            String::new()
        },
        unsupported_reason: unsupported.then(|| {
            "Contexto não suportado ou grande demais para revisão completa. Decida no OpenCode."
                .into()
        }),
        reply_blocked: false,
    })
}

pub fn collect(value: Value, session_id: &str) -> Result<Vec<AgentPermission>, String> {
    let values = value["data"]
        .as_array()
        .filter(|v| v.len() <= 100)
        .ok_or_else(invalid)?;
    let permissions: Vec<_> = values
        .iter()
        .map(|value| project(value, session_id))
        .collect::<Result<_, _>>()?;
    let mut ids = HashSet::new();
    if permissions.iter().any(|p| !ids.insert(&p.id)) {
        return Err(invalid());
    }
    Ok(permissions)
}

pub enum Operation {
    List,
    Send(Value),
}

pub fn decide(
    expected: &AgentPermission,
    request: &AgentPermissionRequest,
    mut api: impl FnMut(Operation) -> Result<Value, String>,
    before_send: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    if expected.id != request.permission_id
        || expected.session_id != request.session_id
        || expected.version != request.version
        || expected.reply_blocked
        || expected.unsupported_reason.is_some()
    {
        return Err("Permissão indisponível ou alterada".into());
    }
    let pending = collect(api(Operation::List)?, &request.session_id)?;
    if !pending.iter().any(|p| {
        p.id == expected.id && p.version == expected.version && p.unsupported_reason.is_none()
    }) {
        return Err("A permissão já foi resolvida ou mudou. Atualize antes de decidir.".into());
    }
    before_send()?;
    let decision = match request.decision {
        AgentPermissionDecision::ApproveOnce => "once",
        AgentPermissionDecision::Reject => "reject",
    };
    match api(Operation::Send(serde_json::json!({"decision":decision}))) {
        Ok(Value::Null) => Ok(()),
        _ => Err("Decisão sem confirmação. Não reenvie: confira a permissão no OpenCode.".into()),
    }
}

pub fn decide_live(
    expected: &AgentPermission,
    request: &AgentPermissionRequest,
    cancelled: impl Fn() -> bool,
    before_send: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let path = installed_cli()?;
    decide(
        expected,
        request,
        |operation| match operation {
            Operation::List => read_cli(
                &path,
                ReadRequest::Permissions(request.session_id.clone()),
                &cancelled,
            ),
            Operation::Send(body) => execute_cli(
                &path,
                &[
                    "api",
                    "POST",
                    &format!(
                        "/api/session/{}/permission/{}/reply",
                        request.session_id, request.permission_id
                    ),
                    "--data",
                    &body.to_string(),
                ],
                &cancelled,
            ),
        },
        before_send,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pending() -> Value {
        json!({"id":"per_test","sessionID":"ses_test","action":"strata.validation","resources":["no-op"],"metadata":{"note":"No tool attached"}})
    }

    #[test]
    fn changed_resolved_oversized_and_permanent_decisions_are_refused() {
        let raw = pending();
        let permission = project(&raw, "ses_test").unwrap();
        let request = AgentPermissionRequest {
            session_id: "ses_test".into(),
            permission_id: "per_test".into(),
            version: permission.version.clone(),
            decision: AgentPermissionDecision::ApproveOnce,
        };
        let mut changed = raw.clone();
        changed["resources"] = serde_json::json!(["different"]);
        for value in [
            serde_json::json!({"data":[]}),
            serde_json::json!({"data":[changed]}),
        ] {
            assert!(decide(
                &permission,
                &request,
                |operation| match operation {
                    Operation::List => Ok(value.clone()),
                    Operation::Send(_) => panic!("Stale decision must not be sent"),
                },
                || Ok(())
            )
            .is_err());
        }
        let mut large = raw.clone();
        large["metadata"] = serde_json::json!({"content":"x".repeat(16385)});
        let large = project(&large, "ses_test").unwrap();
        assert!(large.unsupported_reason.is_some());
        let large_request = AgentPermissionRequest {
            version: large.version.clone(),
            ..request.clone()
        };
        assert!(decide(
            &large,
            &large_request,
            |_| panic!("Incomplete context must not reach decision API"),
            || Ok(())
        )
        .is_err());
        assert!(serde_json::from_value::<AgentPermissionRequest>(serde_json::json!({"sessionId":"ses_test","permissionId":"per_test","version":permission.version,"decision":"always"})).is_err());
        let mut posts = 0;
        let error = decide(
            &permission,
            &request,
            |operation| match operation {
                Operation::List => Ok(serde_json::json!({"data":[raw.clone()]})),
                Operation::Send(_) => {
                    posts += 1;
                    Err("timeout".into())
                }
            },
            || Ok(()),
        )
        .unwrap_err();
        assert_eq!(posts, 1);
        assert!(error.contains("Não reenvie"));
    }

    #[test]
    fn attempted_decisions_remain_blocked_after_reconnect() {
        let permission = project(&pending(), "ses_test").unwrap();
        let request = AgentPermissionRequest {
            session_id: "ses_test".into(),
            permission_id: "per_test".into(),
            version: permission.version.clone(),
            decision: AgentPermissionDecision::Reject,
        };
        let source = crate::agents_contract::OpenCodeSnapshot {
            status: crate::agents_contract::AgentConnectionStatus::Connected,
            permissions: vec![permission],
            ..Default::default()
        };
        let mut connection = super::super::Connection::default();
        connection.configure(true);
        connection.apply(connection.request().unwrap(), Ok(source.clone()));
        connection.begin_permission(&request).unwrap();
        assert!(connection.snapshot().permissions[0].reply_blocked);
        assert!(connection.begin_permission(&request).is_err());
        connection.configure(false);
        connection.configure(true);
        connection.apply(connection.request().unwrap(), Ok(source));
        assert!(connection.pending_permission(&request).is_err());
    }

    #[test]
    #[ignore = "Requires OpenCode v2; approves/rejects only synthetic requests in its own empty temporary session; no tool is attached"]
    fn live_windows_decides_only_its_own_synthetic_permissions() {
        let path = installed_cli().unwrap();
        let folder = std::env::temp_dir().join(format!("strata-permission-{}", std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let rules =
            serde_json::json!([{"action":"strata.validation","resource":"*","effect":"ask"}]);
        let id = super::super::create_empty(folder.to_str().unwrap(), |mut body| {
            body["permissions"] = rules.clone();
            execute_cli(
                &path,
                &["api", "POST", "/api/session", "--data", &body.to_string()],
                &|| false,
            )
        })
        .unwrap();
        let result = (|| -> Result<(), String> {
            for (index, decision) in [
                AgentPermissionDecision::Reject,
                AgentPermissionDecision::ApproveOnce,
            ]
            .into_iter()
            .enumerate()
            {
                let response = execute_cli(&path, &["api", "POST", &format!("/api/session/{id}/permission"), "--data", &serde_json::json!({"id":format!("per_strata_{}_{}",std::process::id(),index),"action":"strata.validation","resources":["strata-noop-test"],"metadata":{"note":"Synthetic request, no tool attached"}}).to_string()], &|| false)?;
                if response["data"]["effect"].as_str() != Some("ask") {
                    return Err("Synthetic request was not pending".into());
                }
                let permission_id = response["data"]["id"]
                    .as_str()
                    .ok_or("Synthetic creation did not return a string ID")?;
                let permission = collect(
                    read_cli(&path, ReadRequest::Permissions(id.clone()), &|| false)?,
                    &id,
                )
                .map_err(|_| "Synthetic pending permission did not match the public schema")?
                .into_iter()
                .find(|p| p.id == permission_id)
                .ok_or("Synthetic request was not found in the pending list")?;
                let request = AgentPermissionRequest {
                    session_id: id.clone(),
                    permission_id: permission.id.clone(),
                    version: permission.version.clone(),
                    decision,
                };
                decide_live(&permission, &request, || false, || Ok(()))?;
                if decide_live(&permission, &request, || false, || Ok(())).is_ok() {
                    return Err("Settled permission accepted another decision".into());
                }
            }
            let state = read_cli(&path, ReadRequest::Session(id.clone()), &|| false)?;
            if state["data"]["permissions"] != rules {
                return Err("Temporary session policy changed".into());
            }
            Ok(())
        })();
        let cleanup = execute_cli(
            &path,
            &["api", "DELETE", &format!("/api/session/{id}")],
            &|| false,
        )
        .is_ok();
        let _ = std::fs::remove_dir(&folder);
        assert!(
            result.is_ok(),
            "Synthetic permission validation failed: {result:?}"
        );
        assert!(cleanup, "Own temporary session was not removed");
        println!("OPENCODE_PERMISSION {{\"approveOnceVerified\":true,\"rejectVerified\":true,\"settledDecisionBlocked\":true,\"sessionPolicyPreserved\":true,\"syntheticRequestsOnly\":true,\"toolAttached\":false,\"testConversationRemoved\":true,\"conversationContentRecorded\":false}}");
    }

    #[test]
    fn shows_the_requested_operation_and_sends_only_an_explicit_single_use_decision() {
        let raw = json!({"id":"per_test","sessionID":"ses_test","action":"shell","resources":["echo Strata"],"metadata":{"command":"echo Strata"},"save":["*"]});
        let permission = project(&raw, "ses_test").unwrap();
        assert_eq!(permission.action, "shell");
        assert_eq!(permission.resources, vec!["echo Strata"]);
        assert!(permission.details.contains("command"));
        for (decision, wire) in [
            (
                crate::agents_contract::AgentPermissionDecision::ApproveOnce,
                "once",
            ),
            (
                crate::agents_contract::AgentPermissionDecision::Reject,
                "reject",
            ),
        ] {
            let request = crate::agents_contract::AgentPermissionRequest {
                session_id: "ses_test".into(),
                permission_id: "per_test".into(),
                version: permission.version.clone(),
                decision,
            };
            decide(
                &permission,
                &request,
                |operation| match operation {
                    Operation::List => Ok(json!({"data":[raw.clone()]})),
                    Operation::Send(body) => {
                        assert_eq!(body, json!({"decision":wire}));
                        Ok(Value::Null)
                    }
                },
                || Ok(()),
            )
            .unwrap();
        }
    }
}

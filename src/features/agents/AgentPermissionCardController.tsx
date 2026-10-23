import { useState } from 'react'
import type {
  AgentPermission,
  AgentPermissionDecision,
  AgentPermissionRequest
} from '@/services/system/agents'
import { AgentPermissionCard } from './AgentPermissionCard'
export function AgentPermissionCardController({
  permission,
  disabled,
  onDecision
}: {
  permission: AgentPermission
  disabled: boolean
  onDecision?: (request: AgentPermissionRequest) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked =
    disabled ||
    pending ||
    attempted ||
    permission.replyBlocked ||
    !!permission.unsupportedReason ||
    !onDecision
  const decide = async (decision: AgentPermissionDecision) => {
    if (blocked || !onDecision) return
    setPending(true)
    setAttempted(true)
    setError(null)
    try {
      await onDecision({
        sessionId: permission.sessionId,
        permissionId: permission.id,
        version: permission.version,
        decision
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <AgentPermissionCard
      permission={permission}
      pending={pending}
      attempted={attempted}
      error={error}
      blocked={blocked}
      onDecision={(decision) => void decide(decision)}
    />
  )
}

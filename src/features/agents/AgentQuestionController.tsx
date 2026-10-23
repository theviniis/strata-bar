import { useState } from 'react'
import type { AgentMessage, AgentReplyRequest } from '@/services/system/agents'
import { AgentQuestion, type AgentQuestionProps } from './AgentQuestion'

export function AgentQuestionController({
  question,
  disabled,
  onReply
}: {
  question: AgentMessage
  disabled: boolean
  onReply?: (request: AgentReplyRequest) => Promise<void>
}) {
  const [answers, setAnswers] = useState(new Map<string, string>())
  const [pending, setPending] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bytes = (text: string) => new TextEncoder().encode(text).length
  const valid =
    question.fields.every((field) => {
      const value = answers.get(field.key) ?? ''
      if (!value && !field.required) return true
      const length = Array.from(value).length
      return (
        (!field.required || !!value.trim()) &&
        length >= (field.minLength ?? 0) &&
        length <= (field.maxLength ?? 4096) &&
        bytes(value) <= 4096 &&
        Array.from(value).every((char) => {
          const code = char.codePointAt(0) ?? 0
          return (
            (code >= 32 && (code < 127 || code > 159)) ||
            ['\n', '\r', '\t'].includes(char)
          )
        })
      )
    }) &&
    [...answers.values()].reduce((total, value) => total + bytes(value), 0) <=
      8192
  const blocked =
    disabled || pending || attempted || question.replyBlocked || !onReply
  const onSubmit: AgentQuestionProps['onSubmit'] = (event) => {
    event.preventDefault()
    if (blocked || !valid || question.unsupportedReason || !onReply) return
    setPending(true)
    setAttempted(true)
    setError(null)
    const values = Object.fromEntries(
      question.fields
        .filter((f) => f.required || !!answers.get(f.key))
        .map((f) => [f.key, answers.get(f.key) ?? ''])
    )
    void onReply({
      sessionId: question.sessionId,
      questionId: question.id,
      version: question.version,
      answers: values
    })
      .then(() => setAnswers(new Map()))
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : String(error))
      )
      .finally(() => setPending(false))
  }
  return (
    <AgentQuestion
      question={question}
      answers={answers}
      pending={pending}
      attempted={attempted}
      error={error}
      blocked={blocked}
      valid={valid}
      onSubmit={onSubmit}
      onAnswerChange={(key, value) =>
        setAnswers((previous) => new Map(previous).set(key, value))
      }
    />
  )
}

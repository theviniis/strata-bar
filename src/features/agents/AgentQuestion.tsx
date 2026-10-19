import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AgentMessage, AgentReplyRequest } from '@/services/system/agents'

export function AgentQuestion({
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
  return (
    <form
      aria-label={question.title}
      className="space-y-2 border-t pt-2"
      onSubmit={(event) => {
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
      }}
    >
      <h5 className="text-xs font-medium wrap-anywhere">{question.title}</h5>
      {question.unsupportedReason ? (
        <p className="text-xs text-muted-foreground">
          {question.unsupportedReason}
        </p>
      ) : (
        <>
          {question.fields.map((field) => (
            <label key={field.key} className="block space-y-1 text-xs">
              <span>{field.title}</span>
              {field.description && (
                <span className="block text-muted-foreground wrap-anywhere">
                  {field.description}
                </span>
              )}
              <Textarea
                aria-label={field.title}
                value={answers.get(field.key) ?? ''}
                disabled={blocked}
                required={field.required}
                onChange={(event) =>
                  setAnswers((previous) =>
                    new Map(previous).set(field.key, event.target.value)
                  )
                }
              />
              <span className="text-muted-foreground">
                {field.required ? 'Obrigatório' : 'Opcional'} · até{' '}
                {field.maxLength ?? 4096} caracteres e 4096 bytes
              </span>
            </label>
          ))}
          <Button type="submit" size="sm" disabled={blocked || !valid}>
            {pending ? 'Enviando resposta…' : 'Enviar resposta'}
          </Button>
          {(question.replyBlocked || attempted) && !pending && (
            <p className="text-xs text-muted-foreground">
              Resposta já tentada. Confira a conversa no OpenCode antes de
              qualquer novo envio.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

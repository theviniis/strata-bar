import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AgentMessage } from '@/services/system/agents'
import type { FormEventHandler } from 'react'

export interface AgentQuestionProps {
  question: AgentMessage
  answers: ReadonlyMap<string, string>
  pending: boolean
  attempted: boolean
  error: string | null
  blocked: boolean
  valid: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onAnswerChange: (key: string, value: string) => void
}
export function AgentQuestion({
  question,
  answers,
  pending,
  attempted,
  error,
  blocked,
  valid,
  onSubmit,
  onAnswerChange
}: AgentQuestionProps) {
  return (
    <form
      aria-label={question.title}
      className="space-y-2 border-t pt-2"
      onSubmit={onSubmit}
    >
      <h5 className="text-body font-medium wrap-anywhere">{question.title}</h5>
      {question.unsupportedReason ? (
        <p className="text-body text-muted-foreground">
          {question.unsupportedReason}
        </p>
      ) : (
        <>
          {question.fields.map((field) => (
            <label key={field.key} className="block space-y-1 text-body">
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
                  onAnswerChange(field.key, event.target.value)
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
            <p className="text-body text-muted-foreground">
              Resposta já tentada. Confira a conversa no OpenCode antes de
              qualquer novo envio.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

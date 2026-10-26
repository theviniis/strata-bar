import { SettingsSection } from './SettingsLayout'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/components/ui/field'
import type { Config } from '@/services/configuration/config'
import type { AgentType } from '@/services/system/agents.generated'
import { getAgentsStore } from '@/stores/agents'
import { useEffect, useId, useState } from 'react'
import type { ConfigDraft } from './draft'

interface AgentsSettingsProps {
  disabled?: boolean
  draft: Config
  onChange(next: ConfigDraft): void
}

const agents: { key: AgentType; label: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'antigravity', label: 'Antigravity' },
  { key: 'codex', label: 'Codex' }
]

export function AgentsSettings(props: AgentsSettingsProps) {
  const [useStore] = useState(getAgentsStore)
  const snapshot = useStore((state) => state.snapshot)
  const error = useStore((state) => state.error)
  useEffect(() => useStore.getState().connect(), [useStore])
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const integrations = [
    {
      key: 'opencode',
      label: 'OpenCode',
      enable: 'Conectar OpenCode',
      disable: 'Desconectar OpenCode',
      configure: useStore.getState().configureOpenCode,
      description:
        'Usa o servidor e a autenticação do OpenCode Desktop v2 instalado. A conexão fica ativa enquanto o Strata estiver aberto.'
    },
    {
      key: 'antigravity',
      label: 'Antigravity',
      enable: 'Ativar hooks do Antigravity',
      disable: 'Desativar hooks do Antigravity',
      configure: useStore.getState().configureAntigravity,
      description:
        'Ativar adiciona os hooks do Strata à configuração global do Antigravity App 2, preservando os demais. Reabra o Antigravity para carregá-los.'
    },
    {
      key: 'codex',
      label: 'Codex',
      enable: 'Ativar hooks do Codex',
      disable: 'Desativar hooks do Codex',
      configure: useStore.getState().configureCodex,
      description:
        'Ativar adiciona os hooks do Strata à configuração global do Codex, preservando os demais. Revise e confie nas definições no Codex antes de utilizá-las; o comando /hooks no CLI permite essa revisão. Reabra a sessão para carregar os hooks.'
    }
  ] as const
  return (
    <FieldGroup>
      <SettingsSection title="Agentes visíveis">
        <AgentVisibility {...props} />
      </SettingsSection>
      <SettingsSection title="Integrações">
        <FieldSet>
          <FieldLegend>Ações imediatas</FieldLegend>
          <FieldDescription>
            Conectar, desconectar e ativar ou desativar hooks tem efeito
            imediato e global. Aplicar e Reverter não desfazem essas ações.
          </FieldDescription>
          {!snapshot && !error && <p role="status">Carregando integrações…</p>}
          {(actionError || error) && (
            <Alert variant="destructive">
              <AlertTitle>Integração indisponível</AlertTitle>
              <AlertDescription>{actionError || error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            {integrations.map((integration) => {
              const connection = snapshot?.[integration.key]
              const enabled = connection && connection.status !== 'disabled'
              return (
                <Field key={integration.key}>
                  <h4 className="text-base font-semibold leading-snug">
                    {integration.label}
                  </h4>
                  <FieldDescription>{integration.description}</FieldDescription>
                  <p role="status">
                    {error
                      ? 'Estado da conexão indisponível'
                      : connection
                        ? {
                            disabled: 'Desativado',
                            connecting: 'Aguardando conexão ou eventos',
                            connected: 'Conectado',
                            disconnected: 'Desconectado'
                          }[connection.status]
                        : 'Carregando…'}
                  </p>
                  {connection?.error && (
                    <Alert variant="destructive">
                      <AlertTitle>{integration.label}</AlertTitle>
                      <AlertDescription>{connection.error}</AlertDescription>
                    </Alert>
                  )}
                  <div>
                    <Button
                      variant="outline"
                      disabled={!connection || !!error || pending}
                      onClick={async () => {
                        setPending(true)
                        setActionError(null)
                        try {
                          await integration.configure(!enabled)
                        } catch (error) {
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : String(error)
                          )
                        } finally {
                          setPending(false)
                        }
                      }}
                    >
                      {enabled ? integration.disable : integration.enable}
                    </Button>
                  </div>
                </Field>
              )
            })}
          </FieldGroup>
        </FieldSet>
      </SettingsSection>
    </FieldGroup>
  )
}

function AgentVisibility({ draft, onChange, disabled }: AgentsSettingsProps) {
  const id = useId()
  return (
    <FieldSet data-disabled={disabled}>
      <FieldLegend id={id} className="sr-only">
        Agentes visíveis
      </FieldLegend>
      <FieldDescription id={`${id}-description`}>
        Escolha quais agentes aparecem na barra e nos alertas. As conexões
        existentes continuam ativas. Esta preferência é global e só muda nas
        barras após Aplicar.
      </FieldDescription>
      <FieldGroup>
        {agents.map(({ key, label }) => (
          <Field key={key} orientation="horizontal" data-disabled={disabled}>
            <Checkbox
              id={`${id}-${key}`}
              disabled={disabled}
              checked={draft.agents.visible[key]}
              onCheckedChange={(checked) =>
                onChange({
                  ...draft,
                  agents: {
                    ...draft.agents,
                    visible: {
                      ...draft.agents.visible,
                      [key]: checked === true
                    }
                  }
                })
              }
            />
            <FieldLabel htmlFor={`${id}-${key}`}>
              Mostrar {label} na barra
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
    </FieldSet>
  )
}

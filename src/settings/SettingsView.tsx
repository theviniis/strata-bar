import { QueryProvider } from '@/components/QueryProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { FieldSet } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Settings2, Save, Undo2, RotateCw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Config } from '@/services/configuration/config'
import { bridge } from '@/services/system/bridge'
import { LayoutEditor } from './LayoutEditor'
import { BarSettings } from './BarSettings'
import {
  createNativePersistence,
  useConfigEditor,
  type ConfigPersistence
} from './draft'

/**
 * The settings window: a plain captioned window hosting the draft editor.
 * Native mode persists through `config_load`/`config_save`; the browser studio
 * falls back to a localStorage persistence so the page stays previewable.
 */
export function SettingsView() {
  const [demoConfig, setDemoConfig] = useState<Config | null>(null)

  useEffect(() => {
    if (bridge.mode === 'native') return
    void import('@/stores/config').then(({ useConfig }) => {
      setDemoConfig(useConfig.getState().config)
    })
  }, [])

  const persistence = useMemo<ConfigPersistence | null>(() => {
    if (bridge.mode === 'native') return createNativePersistence()
    if (!demoConfig) return null
    return createDemoPersistence(demoConfig)
  }, [demoConfig])

  // The hook must run unconditionally; while demo config is still loading the
  // persistence is a no-op stub that keeps the form on the defaults.
  const editor = useConfigEditor(persistence ?? STUB_PERSISTENCE)

  if (!persistence) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 px-4 py-2">
          <Spinner aria-label="Carregando configurações" />
          <span>Carregando...</span>
        </div>
      </div>
    )
  }

  return (
    <QueryProvider>
      <TooltipProvider delay={250}>
        <main className="flex h-screen w-screen flex-col bg-background text-foreground">
          <header className="flex h-14 shrink-0 items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Settings2 className="size-5" aria-hidden="true" />
              <h1 className="text-lg font-semibold">Configurações do Strata</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleWindowClose}
                aria-label="Fechar"
                title="Fechar"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </header>
          <Separator />

          <div className="flex-1 overflow-auto p-6">
            <FieldSet disabled={editor.loading || editor.saving}>
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Editor de Layout
                  </CardTitle>
                  <CardDescription>
                    Organize os widgets nas três seções da barra.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LayoutEditor
                    disabled={editor.loading || editor.saving}
                    draft={editor.form.getValues()}
                    onChange={editor.replaceDraft}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Aparência
                  </CardTitle>
                  <CardDescription>
                    Escolha o tema, o espaçamento e os agentes visíveis.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BarSettings
                    disabled={editor.loading || editor.saving}
                    draft={editor.form.getValues()}
                    onChange={editor.replaceDraft}
                  />
                </CardContent>
              </Card>
            </FieldSet>

            {editor.error && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>
                  Não foi possível aplicar as configurações
                </AlertTitle>
                <AlertDescription>{editor.error.message}</AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />
          <footer className="px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={editor.restoreDefaults}
                  disabled={editor.loading || editor.saving}
                  title="Restaurar configurações padrão"
                >
                  <RotateCw data-icon="inline-start" aria-hidden="true" />
                  Restaurar padrões
                </Button>
                <Button
                  variant="outline"
                  onClick={editor.revert}
                  disabled={editor.loading || editor.saving}
                  title="Descartar alterações e recarregar da configuração salva"
                >
                  <Undo2 data-icon="inline-start" aria-hidden="true" />
                  Reverter
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {bridge.mode === 'demo' ? 'Visualização do navegador' : ''}
                </span>
                <Button
                  onClick={editor.apply}
                  disabled={!!editor.error || editor.loading || editor.saving}
                  title="Aplicar e salvar as alterações"
                >
                  {editor.saving ? (
                    <Spinner data-icon="inline-start" aria-label="Salvando" />
                  ) : (
                    <Save data-icon="inline-start" aria-hidden="true" />
                  )}
                  {editor.saving ? 'Salvando...' : 'Aplicar'}
                </Button>
              </div>
            </div>
          </footer>
        </main>
      </TooltipProvider>
    </QueryProvider>
  )

  async function handleWindowClose() {
    if (bridge.mode === 'native') {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } else {
      window.close()
    }
  }
}

export default SettingsView

/**
 * Placeholder so the editor hook runs while the demo config loads. Module-level
 * because a fresh identity per render would re-trigger the load effect.
 */
const STUB_PERSISTENCE: ConfigPersistence = {
  async load() {
    throw new Error('Carregando configuração do navegador...')
  },
  async save(config) {
    return config
  }
}

/** Browser studio persistence: localStorage is the source of truth. */
function createDemoPersistence(initial: Config): ConfigPersistence {
  const key = 'strata.config.v1'
  return {
    async load() {
      const stored = localStorage.getItem(key)
      if (!stored) return structuredClone(initial)
      return JSON.parse(stored) as Config
    },
    async save(config) {
      localStorage.setItem(key, JSON.stringify(config))
      return structuredClone(config)
    }
  }
}

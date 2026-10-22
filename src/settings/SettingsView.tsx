import { QueryProvider } from '@/components/QueryProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
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
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Carregando...</span>
        </div>
      </div>
    )
  }

  return (
    <QueryProvider>
      <TooltipProvider delay={250}>
        <main className="flex h-screen w-screen flex-col bg-background text-foreground">
          <header className="flex h-14 items-center justify-between border-b px-6">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
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
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6">
            <fieldset disabled={editor.loading || editor.saving}>
              <section className="mb-6">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Editor de Layout</h2>
                </div>
                <LayoutEditor
                  draft={editor.form.getValues()}
                  onChange={editor.replaceDraft}
                />
              </section>

              <section className="mb-6">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Aparência</h2>
                </div>
                <BarSettings
                  draft={editor.form.getValues()}
                  onChange={editor.replaceDraft}
                />
              </section>
            </fieldset>

            {editor.error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 p-3"
              >
                <p className="text-sm text-red-600 dark:text-red-400">
                  {editor.error.message}
                </p>
              </div>
            )}
          </div>

          <footer className="border-t px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={editor.restoreDefaults}
                  disabled={editor.loading || editor.saving}
                  title="Restaurar configurações padrão"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  Restaurar padrões
                </Button>
                <Button
                  variant="outline"
                  onClick={editor.revert}
                  disabled={editor.loading || editor.saving}
                  title="Descartar alterações e recarregar da configuração salva"
                >
                  <Undo2 className="mr-2 h-4 w-4" />
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
                  <Save className="mr-2 h-4 w-4" />
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

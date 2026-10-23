import { CalendarSettings } from '@/features/reminders/CalendarSettings'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { Logo } from '@/components/Logo'
import { QueryProvider } from '@/components/QueryProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { FieldSet } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SpotifySettings } from '@/features/music/SpotifySettings'
import { bridge } from '@/services/system/bridge'
import { cn } from 'cn'
import {
  Bot,
  LayoutDashboard,
  Palette,
  Music2,
  Mic,
  Volume2,
  RotateCw,
  Save,
  Undo2,
  X
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type CSSProperties } from 'react'
import { AgentsSettings } from './AgentsSettings'
import { AudioSettings } from './AudioSettings'
import { BarSettings } from './BarSettings'
import { createNativePersistence, useConfigEditor } from './draft'
import { LayoutEditor } from './LayoutEditor'
import {
  readNavigation,
  rememberNavigation,
  type SettingsNavigation
} from './navigation'
type SettingsSection = SettingsNavigation['section']

/** Edits the configuration Draft and manages explicit integration actions. */
export function SettingsView() {
  if (bridge.mode !== 'native')
    return <p>Open Settings from the Windows tray to configure Strata.</p>
  return <NativeSettingsView />
}

function NativeSettingsView() {
  const [section, setSection] = useState<SettingsSection>(
    () => readNavigation().section
  )

  const persistence = useMemo(() => createNativePersistence(), [])
  const editor = useConfigEditor(persistence)
  const disabled = !editor.loaded || editor.loading || editor.saving

  return (
    <QueryProvider>
      <TooltipProvider delay={250}>
        <SidebarProvider
          className="h-screen min-h-0"
          style={{ '--sidebar-width': '12rem' } as CSSProperties}
        >
          <SettingsSidebar
            section={section}
            onSelect={(next) => {
              setSection(next)
              rememberNavigation({ section: next })
            }}
          />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
            <header className="flex h-14 shrink-0 items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <SidebarTrigger aria-label="Alternar navegação" />
                <h1 className="text-lg font-semibold">Configurações</h1>
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

            <motion.div
              layoutScroll
              className="min-h-0 flex-1 overflow-auto p-6"
            >
              <FieldSet disabled={disabled}>
                {section === 'layout' ? (
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
                        disabled={disabled}
                        draft={editor.form.getValues()}
                        onChange={editor.replaceDraft}
                      />
                    </CardContent>
                  </Card>
                ) : section === 'reminders' ? (
                  <Card>
                    <CardHeader>
                      <CardTitle role="heading" aria-level={2}>
                        Lembretes
                      </CardTitle>
                      <CardDescription>
                        Conectar e desconectar Google Calendar têm efeito
                        imediato. Reverter não desfaz essas operações externas.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CalendarSettings />
                    </CardContent>
                  </Card>
                ) : section === 'appearance' ? (
                  <Card>
                    <CardHeader>
                      <CardTitle role="heading" aria-level={2}>
                        Aparência
                      </CardTitle>
                      <CardDescription>
                        Escolha o tema e o espaçamento da barra.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BarSettings
                        disabled={disabled}
                        draft={editor.form.getValues()}
                        onChange={editor.replaceDraft}
                      />
                    </CardContent>
                  </Card>
                ) : section === 'music' ? (
                  <Card>
                    <CardHeader>
                      <CardTitle role="heading" aria-level={2}>
                        Player de música
                      </CardTitle>
                      <CardDescription>
                        Conectar e desconectar têm efeito imediato. Aplicar
                        salva apenas as preferências do Draft; Reverter não
                        desfaz a conexão ou desconexão da conta.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SpotifySettings />
                    </CardContent>
                  </Card>
                ) : section === 'agents' ? (
                  <Card>
                    <CardHeader>
                      <CardTitle role="heading" aria-level={2}>
                        Agentes
                      </CardTitle>
                      <CardDescription>
                        Seleção de agentes e integrações existentes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AgentsSettings
                        draft={editor.form.getValues()}
                        onChange={editor.replaceDraft}
                        disabled={disabled}
                      />
                    </CardContent>
                  </Card>
                ) : section === 'audio-input' || section === 'audio-output' ? (
                  <AudioSettings
                    key={section}
                    type={section === 'audio-input' ? 'microphone' : 'volume'}
                    draft={editor.form.getValues()}
                    onChange={editor.replaceDraft}
                  />
                ) : (
                  <Field data-invalid={!!editor.error}>
                    <FieldLabel htmlFor="config-json">
                      Configuração JSON
                    </FieldLabel>
                    <Textarea
                      id="config-json"
                      rows={24}
                      spellCheck={false}
                      aria-invalid={!!editor.error}
                      aria-describedby={
                        editor.error ? 'config-error' : undefined
                      }
                      value={editor.jsonText}
                      onChange={(event) =>
                        editor.replaceText(event.target.value)
                      }
                    />
                  </Field>
                )}
              </FieldSet>

              {editor.error && (
                <Alert id="config-error" variant="destructive" className="mt-6">
                  <AlertTitle>
                    Não foi possível aplicar as configurações
                  </AlertTitle>
                  <AlertDescription>{editor.error.message}</AlertDescription>
                </Alert>
              )}
            </motion.div>

            <Separator />
            <footer className="flex flex-col gap-3 px-6 py-4">
              {editor.reverted && (
                <Alert role="status">
                  <AlertTitle>Configurações recarregadas no editor</AlertTitle>
                  <AlertDescription>
                    Nenhuma alteração foi salva. Clique em Aplicar para salvar e
                    aplicar as configurações.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={editor.restoreDefaults}
                    disabled={disabled}
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
                    disabled={!!editor.error || disabled}
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
        </SidebarProvider>
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

function SettingsSidebar({
  section,
  onSelect
}: {
  section: SettingsSection
  onSelect(section: SettingsSection): void
}) {
  const { setOpenMobile, open } = useSidebar()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className={cn(!open && 'grid place-content-center')}
            >
              <Logo alt={open ? '' : 'Strata'} background={false} />
              {open && <span>Strata</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Seções das configurações">
              <SidebarMenu>
                {(
                  [
                    { id: 'layout', label: 'Layout', icon: LayoutDashboard },
                    { id: 'appearance', label: 'Aparência', icon: Palette },
                    {
                      id: 'reminders',
                      label: 'Lembretes',
                      icon: LayoutDashboard
                    },

                    { id: 'agents', label: 'Agentes', icon: Bot },
                    { id: 'music', label: 'Player de música', icon: Music2 },
                    { id: 'audio-input', label: 'Entrada de áudio', icon: Mic },
                    {
                      id: 'audio-output',
                      label: 'Saída de áudio',
                      icon: Volume2
                    },
                    { id: 'json', label: 'JSON', icon: LayoutDashboard }
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={section === id}
                      aria-current={section === id ? 'page' : undefined}
                      tooltip={label}
                      onClick={() => {
                        onSelect(id)
                        setOpenMobile(false)
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export default SettingsView

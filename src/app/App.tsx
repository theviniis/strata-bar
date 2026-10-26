import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { Logo } from '@/components/Logo'
import { QueryProvider } from '@/components/QueryProvider'

import { TooltipProvider } from '@/components/ui/tooltip'
import { useEffect } from 'react'
import { StudioBar } from '../components/status-bar/StudioBar'
import { loadConfig, useConfig, watchConfig } from '../stores/config'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'

export default function App() {
  const config = useConfig((s) => s.config)
  const theme = useResolvedTheme(config.bar.theme)
  useEffect(() => {
    loadConfig()
    return watchConfig()
  }, [])
  return (
    <QueryProvider>
      <TooltipProvider delay={250}>
        <main
          data-theme={theme}
          className="group mx-auto max-w-360 px-[7%] pt-8 max-[1000px]:px-[4%] max-[1000px]:pt-6"
        >
          <header className="flex items-center justify-between border-b border-border pb-7">
            <a
              className={`flex cursor-pointer touch-manipulation items-center gap-2.5 text-page tracking-tight text-inherit no-underline ${focusRing}`}
              href="#"
            >
              <Logo alt="" />
              strata
              <span className="ml-3.5 text-body tracking-normal text-muted-foreground max-[1000px]:hidden">
                {' '}
                / bar studio
              </span>
            </a>
            <span className="rounded-[20px] border border-border px-3 py-2 text-micro tracking-widest text-secondary">
              BROWSER PREVIEW
            </span>
          </header>
          <section className="pt-16 pb-9.5">
            <div className="flex items-center gap-2 text-micro font-semibold tracking-widest text-secondary">
              YOUR DESKTOP, IN BALANCE
            </div>
            <h1 className="my-5.5 text-studio-display font-medium tracking-display">
              A little space.
              <br />
              <span className="text-primary">A clearer view.</span>
            </h1>
            <p className="text-body text-muted-foreground">
              A compact home for the things you want to keep an eye on.
              <br />
              Configure your desktop bar in Settings, opened from the Windows
              tray.
            </p>
          </section>
          <section
            className="overflow-hidden rounded-[14px] border border-border shadow-[0_24px_80px_#0004]"
            aria-label="Status bar preview"
          >
            <div className="flex justify-between bg-card px-5 py-4 text-micro tracking-widest text-muted-foreground">
              <span>DISPLAY-ONLY DEMO</span>
              <span>01 / PRIMARY DISPLAY</span>
            </div>
            <div className="relative isolate h-71.25 overflow-hidden bg-linear-to-br from-muted to-background p-3">
              <div className="absolute -z-10 top-22.5 right-[5%] h-162.5 w-162.5 rounded-full border border-secondary/20 bg-secondary/5" />
              <div
                className={
                  config.bar.position === 'bottom'
                    ? 'absolute inset-x-3 bottom-10.5'
                    : 'relative'
                }
              >
                <div inert>
                  <StudioBar config={config} staticPreview />
                </div>
              </div>
              <div className="absolute inset-x-0 top-[54%] flex items-center justify-center gap-2.25 text-body text-foreground">
                <span className="h-1.25 w-1.25 rounded-full bg-primary" /> Your
                workspace, uninterrupted
              </div>
              <div className="absolute bottom-4.5 left-5.5 right-5.5 flex justify-between text-micro tracking-widest text-muted-foreground">
                Sample metrics · preview data · no system access
                <span>STRATA / 0.1</span>
              </div>
            </div>
          </section>
          <footer className="flex justify-between border-t border-border py-6 text-micro tracking-widest text-muted-foreground">
            <span>STRATA</span>
            <span>Less noise. More room.</span>
            <span>Foundation preview / Windows 11 target</span>
          </footer>
        </main>
      </TooltipProvider>
    </QueryProvider>
  )
}

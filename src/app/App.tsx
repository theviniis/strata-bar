import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { Logo } from '@/components/Logo'
import { QueryProvider } from '@/components/QueryProvider'

import { TooltipProvider } from '@/components/ui/tooltip'
import { useEffect } from 'react'
import { StudioBar } from '../components/status-bar/StudioBar'
import { loadConfig, useConfig, watchConfig } from '../stores/config'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b7a1ff]'

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
          <header className="flex items-center justify-between border-b border-[#292a32] pb-7">
            <a
              className={`flex cursor-pointer touch-manipulation items-center gap-2.5 text-page font-semibold tracking-tight text-inherit no-underline ${focusRing}`}
              href="#"
            >
              <Logo alt="" />
              strata
              <span className="ml-3.5 text-body font-normal tracking-normal text-[#858694] max-[1000px]:hidden">
                {' '}
                / bar studio
              </span>
            </a>
            <span className="rounded-[20px] border border-[#3c3548] px-3 py-2 text-micro tracking-widest text-[#b7accd]">
              BROWSER PREVIEW
            </span>
          </header>
          <section className="pt-16 pb-9.5">
            <div className="flex items-center gap-2 text-micro font-semibold tracking-widest text-[#a79bbf]">
              YOUR DESKTOP, IN BALANCE
            </div>
            <h1 className="my-5.5 text-studio-display font-medium tracking-display">
              A little space.
              <br />
              <span className="text-[#a49caf]">A clearer view.</span>
            </h1>
            <p className="text-body text-[#92929f]">
              A compact home for the things you want to keep an eye on.
              <br />
              Configure your desktop bar in Settings, opened from the Windows
              tray.
            </p>
          </section>
          <section
            className="overflow-hidden rounded-[14px] border border-[#34323e] shadow-[0_24px_80px_#0004]"
            aria-label="Status bar preview"
          >
            <div className="flex justify-between bg-[#1b1b23] px-5 py-4 text-micro tracking-widest text-[#9d98ac]">
              <span>DISPLAY-ONLY DEMO</span>
              <span>01 / PRIMARY DISPLAY</span>
            </div>
            <div className="relative isolate h-71.25 overflow-hidden bg-[radial-gradient(ellipse_at_72%_130%,#7c617c88,transparent_65%),linear-gradient(135deg,#222332,#333044_60%,#4a3c50)] p-3">
              <div className="absolute -z-10 top-22.5 right-[5%] h-162.5 w-162.5 rounded-full border border-[#d9c4f62a] bg-[linear-gradient(130deg,#c4b6dc15,transparent_50%)] shadow-[0_0_0_55px_#c4b3ed06,0_0_0_110px_#c4b3ed04]" />
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
              <div className="absolute inset-x-0 top-[54%] flex items-center justify-center gap-2.25 text-caption text-[#cac1d5]">
                <span className="h-1.25 w-1.25 rounded-full bg-[#c7b5ea]" />{' '}
                Your workspace, uninterrupted
              </div>
              <div className="absolute bottom-4.5 left-5.5 right-5.5 flex justify-between text-micro tracking-widest text-[#c0b4ca]">
                Sample metrics · preview data · no system access
                <span>STRATA / 0.1</span>
              </div>
            </div>
          </section>
          <footer className="flex justify-between border-t border-[#292a32] py-6 text-micro tracking-widest text-[#6e6d7c]">
            <span>STRATA</span>
            <span>Less noise. More room.</span>
            <span>Foundation preview / Windows 11 target</span>
          </footer>
        </main>
      </TooltipProvider>
    </QueryProvider>
  )
}

import { useEffect, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Layers3, ArrowUpRight, Check, Settings2 } from 'lucide-react'
import { useConfig, loadConfig, watchConfig } from '../stores/config'
import { Widget } from '../components/status-bar/Widget'
import { bridge } from '../services/system/bridge'
import type { BarConfig, WidgetConfig } from '../services/configuration/config'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b7a1ff]'

export default function App() {
  const config = useConfig((s) => s.config),
    error = useConfig((s) => s.error),
    apply = useConfig((s) => s.apply)
  const [draft, setDraft] = useState(''),
    [editing, setEditing] = useState(false)
  useEffect(() => {
    loadConfig()
    return watchConfig()
  }, [])
  const change = (bar: Partial<BarConfig>) =>
    apply(JSON.stringify({ ...config, bar: { ...config.bar, ...bar } }))
  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="min-h-screen bg-[#101116] text-[#ebedf5] [font-synthesis:none]">
        <main
          data-theme={config.bar.theme}
          className="group mx-auto max-w-[1440px] px-[7%] pt-[32px] max-[1000px]:px-[4%] max-[1000px]:pt-[24px]"
        >
          <header className="flex items-center justify-between border-b border-[#292a32] pb-[28px]">
            <a
              className={`flex cursor-pointer touch-manipulation items-center gap-[10px] text-[23px] font-[650] tracking-[-1px] text-inherit no-underline ${focusRing}`}
              href="#"
            >
              <Layers3 size={23} className="text-[#b5a1f4]" />
              strata
              <span className="ml-[14px] text-[13px] font-normal tracking-normal text-[#858694] max-[1000px]:hidden">
                {' '}
                / bar studio
              </span>
            </a>
            <span className="rounded-[20px] border border-[#3c3548] px-[12px] py-[8px] text-[10px] tracking-[1.4px] text-[#b7accd]">
              {bridge.mode === 'demo' ? 'BROWSER PREVIEW' : 'NATIVE FOUNDATION'}
            </span>
          </header>
          <section className="pt-[64px] pb-[38px]">
            <div className="flex items-center gap-[8px] text-[10px] font-semibold tracking-[2px] text-[#a79bbf]">
              YOUR DESKTOP, IN BALANCE
            </div>
            <h1 className="my-[22px] text-[clamp(40px,4.5vw,64px)] leading-[1.08] font-medium tracking-[-2.5px]">
              A little space.
              <br />
              <span className="text-[#a49caf]">A clearer view.</span>
            </h1>
            <p className="text-[13px] leading-[1.8] text-[#92929f]">
              A compact home for the things you want to keep an eye on.
              <br />
              Shape your bar. Keep your focus.
            </p>
            <a
              className={`inline-flex cursor-pointer touch-manipulation items-center gap-[14px] border-0 bg-transparent py-[12px] text-[12px] text-[#d3c4f5] no-underline ${focusRing}`}
              href="#customize"
            >
              Make it yours <ArrowUpRight size={16} />
            </a>
          </section>
          <section
            className="overflow-hidden rounded-[14px] border border-[#34323e] shadow-[0_24px_80px_#0004]"
            aria-label="Status bar preview"
          >
            <div className="flex justify-between bg-[#1b1b23] px-[20px] py-[16px] text-[9px] tracking-[1.5px] text-[#9d98ac]">
              <span>LIVE PREVIEW</span>
              <span>01 / PRIMARY DISPLAY</span>
            </div>
            <div className="relative isolate h-[285px] overflow-hidden bg-[radial-gradient(ellipse_at_72%_130%,#7c617c88,transparent_65%),linear-gradient(135deg,#222332,#333044_60%,#4a3c50)] p-[12px]">
              <div className="absolute -z-10 top-[90px] right-[5%] h-[650px] w-[650px] rounded-full border border-[#d9c4f62a] bg-[linear-gradient(130deg,#c4b6dc15,transparent_50%)] shadow-[0_0_0_55px_#c4b3ed06,0_0_0_110px_#c4b3ed04]" />
              <nav
                aria-label="Status bar"
                className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center rounded-[9px] border border-[#ffffff12] bg-[#12121ce0] px-[10px] py-[4px] text-[#dddce8] shadow-[0_4px_16px_#0002] group-data-[theme=light]:bg-[#f8f5f2ed] group-data-[theme=light]:text-[#302a3e] max-[1000px]:grid-cols-[1fr_auto] ${
                  config.bar.position === 'bottom'
                    ? 'absolute inset-x-[12px] bottom-[42px]'
                    : ''
                }`}
                style={{
                  minHeight: config.bar.height,
                  gap: config.bar.spacing
                }}
              >
                {Object.entries(config.widgets).map(([group, widgets]) => (
                  <div
                    className={`flex min-w-0 items-center ${
                      group === 'right'
                        ? 'justify-end max-[1000px]:col-span-full max-[1000px]:justify-center'
                        : group === 'center'
                          ? 'max-[1000px]:col-start-2 max-[1000px]:row-start-1'
                          : ''
                    }`}
                    key={group}
                    style={{ gap: config.bar.spacing }}
                  >
                    {widgets
                      .filter((w) => w.enabled)
                      .map((widget) => (
                        <Widget key={widget.id} widget={widget} />
                      ))}
                  </div>
                ))}
              </nav>
              <div className="absolute inset-x-0 top-[54%] flex items-center justify-center gap-[9px] text-[11px] text-[#cac1d5]">
                <span className="h-[5px] w-[5px] rounded-full bg-[#c7b5ea]" />{' '}
                Your workspace, uninterrupted
              </div>
              <div className="absolute bottom-[18px] left-[22px] right-[22px] flex justify-between text-[9px] tracking-[1px] text-[#c0b4ca]">
                {bridge.mode === 'demo'
                  ? 'Sample metrics · GPU unavailable'
                  : 'Native collectors pending'}
                <span>STRATA / 0.1</span>
              </div>
            </div>
          </section>
          <section
            id="customize"
            className="mt-[48px] grid grid-cols-[1fr_1.3fr] gap-[36px] border-b border-[#292a32] pb-[34px] max-[1000px]:grid-cols-1"
          >
            <div>
              <div className="flex items-center gap-[8px] text-[10px] font-semibold tracking-[2px] text-[#a79bbf]">
                <Settings2 size={14} /> THE DETAILS
              </div>
              <h2 className="mt-[15px] mb-[6px] text-[24px] font-[450] tracking-[-0.6px]">
                Feels like your desktop.
              </h2>
              <p className="text-[13px] leading-[1.8] text-[#92929f]">
                Small adjustments. A different perspective.
              </p>
            </div>
            <div className="grid grid-cols-2 content-center gap-[22px]">
              <label className="text-[11px] text-[#aeabb8]">
                Appearance
                <div className="mt-[10px] flex rounded-[7px] border border-[#30303c] bg-[#1a1b23] p-[4px]">
                  {(['dark', 'light'] as const).map((theme) => (
                    <button
                      key={theme}
                      className={`flex-1 cursor-pointer touch-manipulation rounded-[4px] border-0 bg-transparent p-[8px] text-[11px] text-[#8f8d9b] capitalize aria-pressed:bg-[#35303f] aria-pressed:text-[#e8dcff] aria-pressed:shadow-[0_1px_3px_#0003] ${focusRing}`}
                      aria-pressed={config.bar.theme === theme}
                      onClick={() => change({ theme })}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </label>
              <label className="text-[11px] text-[#aeabb8]">
                Position
                <div className="mt-[10px] flex rounded-[7px] border border-[#30303c] bg-[#1a1b23] p-[4px]">
                  {(['top', 'bottom'] as const).map((position) => (
                    <button
                      key={position}
                      className={`flex-1 cursor-pointer touch-manipulation rounded-[4px] border-0 bg-transparent p-[8px] text-[11px] text-[#8f8d9b] capitalize aria-pressed:bg-[#35303f] aria-pressed:text-[#e8dcff] aria-pressed:shadow-[0_1px_3px_#0003] ${focusRing}`}
                      aria-pressed={config.bar.position === position}
                      onClick={() => change({ position })}
                    >
                      {position}
                    </button>
                  ))}
                </div>
              </label>
              <label className="col-span-full text-[11px] text-[#aeabb8]">
                Bar height{' '}
                <span className="float-right">{config.bar.height}px</span>
                <input
                  className={`mt-[16px] h-[3px] w-full touch-manipulation accent-[#b4a1df] ${focusRing}`}
                  aria-label="Bar height"
                  type="range"
                  min="28"
                  max="64"
                  value={config.bar.height}
                  onChange={(e) => change({ height: Number(e.target.value) })}
                />
              </label>
            </div>
          </section>
          <section className="flex items-center justify-between gap-[24px] py-[25px] max-[1000px]:flex-col max-[1000px]:items-start">
            <div>
              <h3 className="text-[13px] font-medium">On your bar</h3>
              <p className="my-[4px] text-[11px] leading-[1.8] text-[#92929f]">
                Only what matters to you.
              </p>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {Object.values(config.widgets)
                .flat()
                .map((w) => (
                  <button
                    key={w.id}
                    className={`flex cursor-pointer touch-manipulation items-center gap-[5px] rounded-[6px] border border-[#35313f] bg-[#211e2a] px-[10px] py-[8px] text-[10px] text-[#bdb0d4] aria-[pressed=false]:opacity-50 ${focusRing}`}
                    aria-pressed={w.enabled}
                    onClick={() =>
                      apply(
                        JSON.stringify({
                          ...config,
                          widgets: Object.fromEntries(
                            Object.entries(config.widgets).map(
                              ([group, ws]): [string, WidgetConfig[]] => [
                                group,
                                ws.map((x) =>
                                  x.id === w.id
                                    ? { ...x, enabled: !x.enabled }
                                    : x
                                )
                              ]
                            )
                          )
                        })
                      )
                    }
                  >
                    {w.enabled && <Check size={13} />} {w.type}
                  </button>
                ))}
            </div>
          </section>
          <section className="pb-[24px]">
            <button
              className={`inline-flex cursor-pointer touch-manipulation items-center gap-[14px] border-0 bg-transparent py-[12px] text-[12px] text-[#d3c4f5] no-underline ${focusRing}`}
              onClick={() => {
                setDraft(JSON.stringify(config, null, 2))
                setEditing(!editing)
              }}
            >
              {' '}
              {editing ? 'Close configuration' : 'Edit JSON configuration'}{' '}
              <ArrowUpRight size={14} />
            </button>
            {editing && (
              <>
                <label
                  className="block text-[11px] text-[#aeabb8]"
                  htmlFor="config"
                >
                  Configuration JSON
                </label>
                <textarea
                  className={`my-[12px] min-h-[300px] w-full touch-manipulation rounded-[8px] border border-[#494052] bg-[#18171e] p-[16px] font-mono text-[12px] leading-[normal] text-[#d4c8e6] ${focusRing}`}
                  id="config"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className={`cursor-pointer touch-manipulation rounded-[5px] border-0 bg-[#c5b1ed] px-[16px] py-[9px] text-[#201a2c] ${focusRing}`}
                  onClick={() => apply(draft)}
                >
                  Apply configuration
                </button>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="text-[13px] leading-[1.8] text-[#92929f]"
              >
                Configuration unchanged: {error}
              </p>
            )}
          </section>
          <footer className="flex justify-between border-t border-[#292a32] py-[24px] text-[9px] tracking-[1px] text-[#6e6d7c]">
            <span>STRATA</span>
            <span>Less noise. More room.</span>
            <span>Foundation preview / Windows 11 target</span>
          </footer>
        </main>
      </div>
    </Tooltip.Provider>
  )
}

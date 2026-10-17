import { useEffect, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Layers3, ArrowUpRight, Check, Settings2 } from 'lucide-react'
import { useConfig, loadConfig, watchConfig } from '../stores/config'
import { Widget } from '../components/status-bar/Widget'
import { bridge } from '../services/system/bridge'
import type { BarConfig, WidgetConfig } from '../services/configuration/config'

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
      <main data-theme={config.bar.theme}>
        <header>
          <a className="brand" href="#">
            <Layers3 size={23} />
            strata<span> / bar studio</span>
          </a>
          <span className="badge">
            {bridge.mode === 'demo' ? 'BROWSER PREVIEW' : 'NATIVE FOUNDATION'}
          </span>
        </header>
        <section className="intro">
          <div className="eyebrow">YOUR DESKTOP, IN BALANCE</div>
          <h1>
            A little space.
            <br />
            <span>A clearer view.</span>
          </h1>
          <p>
            A compact home for the things you want to keep an eye on.
            <br />
            Shape your bar. Keep your focus.
          </p>
          <a className="text-link" href="#customize">
            Make it yours <ArrowUpRight size={16} />
          </a>
        </section>
        <section className="preview" aria-label="Status bar preview">
          <div className="preview-label">
            <span>LIVE PREVIEW</span>
            <span>01 / PRIMARY DISPLAY</span>
          </div>
          <div className={`desktop ${config.bar.position}`}>
            <div className="orb" />
            <nav
              aria-label="Status bar"
              className="status-bar"
              style={{ minHeight: config.bar.height, gap: config.bar.spacing }}
            >
              {Object.entries(config.widgets).map(([group, widgets]) => (
                <div
                  className={`group ${group}`}
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
            <div className="desktop-caption">
              <span className="dot" /> Your workspace, uninterrupted
            </div>
            <div className="desktop-meta">
              {bridge.mode === 'demo'
                ? 'Sample metrics · GPU unavailable'
                : 'Native collectors pending'}
              <span>STRATA / 0.1</span>
            </div>
          </div>
        </section>
        <section id="customize" className="customize">
          <div>
            <div className="eyebrow">
              <Settings2 size={14} /> THE DETAILS
            </div>
            <h2>Feels like your desktop.</h2>
            <p>Small adjustments. A different perspective.</p>
          </div>
          <div className="controls">
            <label>
              Appearance
              <div className="segmented">
                {(['dark', 'light'] as const).map((theme) => (
                  <button
                    key={theme}
                    aria-pressed={config.bar.theme === theme}
                    onClick={() => change({ theme })}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Position
              <div className="segmented">
                {(['top', 'bottom'] as const).map((position) => (
                  <button
                    key={position}
                    aria-pressed={config.bar.position === position}
                    onClick={() => change({ position })}
                  >
                    {position}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Bar height <span>{config.bar.height}px</span>
              <input
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
        <section className="widget-list">
          <div>
            <h3>On your bar</h3>
            <p>Only what matters to you.</p>
          </div>
          <div className="chips">
            {Object.values(config.widgets)
              .flat()
              .map((w) => (
                <button
                  key={w.id}
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
        <section className="config-section">
          <button
            className="text-link"
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
              <label htmlFor="config">Configuration JSON</label>
              <textarea
                id="config"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="apply" onClick={() => apply(draft)}>
                Apply configuration
              </button>
            </>
          )}
          {error && <p role="alert">Configuration unchanged: {error}</p>}
        </section>
        <footer>
          <span>STRATA</span>
          <span>Less noise. More room.</span>
          <span>Foundation preview / Windows 11 target</span>
        </footer>
      </main>
    </Tooltip.Provider>
  )
}

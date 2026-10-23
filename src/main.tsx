import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './app/styles.css'
import NativeBar from './components/status-bar/NativeBar'
import { Spinner } from './components/ui/spinner'
import { connectConfig, loadConfig, watchConfig } from './stores/config'
import { getRemindersStore } from './stores/reminders'
import { OverlayView, PopupCheckView, SettingsView, StudioView } from './views'

// `?view=` is set by the native host: `bar` for AppBar strips, `overlay` for the
// shared floating surface. The browser studio arrives without a view and without
// Tauri internals, so it keeps rendering the demo shell. `index.html` resolves
// the same value before the first paint; this is the routing authority.
const native = Boolean(window.__TAURI_INTERNALS__)
const view =
  document.documentElement.dataset.view ?? (native ? 'bar' : 'studio')

// Every native window reads the file-backed configuration and follows its
// `config` events; each bar receives the projection for its own monitor. The
// browser paths keep localStorage, which never feeds the native runtime.
if (native) {
  const stopConfig = connectConfig()
  import.meta.hot?.dispose(stopConfig)
} else if (view === 'bar' || view === 'overlay') {
  loadConfig()
  const stopConfig = watchConfig()
  import.meta.hot?.dispose(stopConfig)
}

const remindersConnection = getRemindersStore()
  .getState()
  .connect()
  .then((dispose) => {
    const stop = getRemindersStore().getState().startDemoScheduler()
    return () => {
      stop()
      dispose()
    }
  })
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void remindersConnection.then((dispose) => dispose())
  })
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="flex items-center gap-2 px-4 py-2 bg-card text-card-foreground rounded">
          <Spinner />
          <p>Carregando...</p>
        </div>
      }
    >
      {view === 'overlay' ? (
        <OverlayView />
      ) : view === 'settings' ? (
        <SettingsView />
      ) : import.meta.env.DEV &&
        new URLSearchParams(window.location.search).has('popup-check') ? (
        <PopupCheckView />
      ) : native || view === 'bar' ? (
        <NativeBar />
      ) : (
        <StudioView />
      )}
    </Suspense>
  </React.StrictMode>
)

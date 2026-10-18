import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './app/styles.css'
import NativeBar from './components/status-bar/NativeBar'
import Overlay from './overlay/Overlay'
import { PopupCheckBar } from './popups/PopupCheckBar'

// `?view=` is set by the native host: `bar` for AppBar strips, `overlay` for
// the shared floating surface. The browser studio arrives without a view and
// without Tauri internals, so it keeps rendering the demo shell.
const native = Boolean(window.__TAURI_INTERNALS__)
const view = new URLSearchParams(window.location.search).get('view')
document.documentElement.dataset.view = view ?? (native ? 'bar' : 'studio')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'overlay' ? (
      <Overlay />
    ) : import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has('popup-check') ? (
      <PopupCheckBar />
    ) : native || view === 'bar' ? (
      <NativeBar />
    ) : (
      <App />
    )}
  </React.StrictMode>
)

// The native host injects this object into every WebView it creates. Its presence is the
// only signal the bridge uses to pick the native adapter; see services/system/bridge.ts.
interface Window {
  __TAURI_INTERNALS__?: unknown
}

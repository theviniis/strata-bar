import { Volume } from '../features/volume/Volume'

/** Development-only fixture for --check-popups; excludes unrelated widget work. */
export function PopupCheckBar() {
  return (
    <nav className="native-bar flex h-screen items-center justify-end px-4">
      <Volume />
    </nav>
  )
}

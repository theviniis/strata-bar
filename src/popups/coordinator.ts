let active: { owner: string; close(): void } | null = null
const listeners = new Set<() => void>()

export function subscribePopupState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function popupIsActive() {
  return active !== null
}

export function claimPopup(owner: string, close: () => void) {
  if (active?.owner !== owner) active?.close()
  active = { owner, close }
  listeners.forEach((listener) => listener())
  window.dispatchEvent(new Event('strata:popup-open'))
}

export function releasePopup(owner: string) {
  if (active?.owner === owner) {
    active = null
    listeners.forEach((listener) => listener())
  }
}

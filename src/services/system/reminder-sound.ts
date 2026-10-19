let audio: AudioContext | undefined

/** Called from the studio creation gesture; native alerts use MessageBeep. */
export function prepareDemoReminderSound() {
  if (window.__TAURI_INTERNALS__ || typeof AudioContext === 'undefined') return
  try {
    audio ??= new AudioContext()
    void audio.resume().catch(() => {})
  } catch {
    /* Browser audio is optional in the labelled demo. */
  }
}

export function playDemoReminderSound(): boolean {
  if (!audio || audio.state !== 'running') return false
  const gain = audio.createGain()
  gain.gain.value = 0.1
  gain.connect(audio.destination)
  const oscillator = audio.createOscillator()
  oscillator.frequency.setValueAtTime(880, audio.currentTime)
  oscillator.frequency.setValueAtTime(660, audio.currentTime + 0.15)
  oscillator.connect(gain)
  oscillator.start()
  oscillator.stop(audio.currentTime + 0.3)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
  return true
}

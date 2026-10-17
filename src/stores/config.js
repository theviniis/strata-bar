import { create } from 'zustand';
import {
  defaultConfig,
  parseConfig,
  storageKey,
} from '../services/configuration/config';
export const useConfig = create((set) => ({
  config: defaultConfig,
  error: null,
  apply(text, persist = true) {
    try {
      const config = parseConfig(text);
      if (persist) localStorage.setItem(storageKey, JSON.stringify(config));
      set({ config, error: null });
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },
}));
export function loadConfig() {
  try {
    const text = localStorage.getItem(storageKey);
    if (text) useConfig.getState().apply(text, false);
  } catch (e) {
    useConfig.setState({ error: e.message });
  }
}
export function watchConfig() {
  const handler = (e) => {
    if (e.key === storageKey && e.newValue)
      useConfig.getState().apply(e.newValue, false);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

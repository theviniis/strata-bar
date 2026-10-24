import { useDocumentTheme } from '@/hooks/useDocumentTheme'
import { useConfig } from '@/stores/config'

export function DocumentTheme() {
  useDocumentTheme(useConfig((state) => state.config.bar))
  return null
}

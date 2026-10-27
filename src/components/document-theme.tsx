import { useDocumentTheme } from '@/hooks/use-document-theme'
import { useConfig } from '@/stores/config'

export function DocumentTheme() {
  useDocumentTheme(useConfig((state) => state.config.bar))
  return null
}

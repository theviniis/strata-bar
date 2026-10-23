import { addons } from 'storybook/manager-api'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import type { GlobalsUpdatedPayload } from 'storybook/internal/types'
import '@fontsource-variable/geist'
import { strataThemes } from './theme'

addons.setConfig({ theme: strataThemes.dark })
addons.register('strata/theme', (api) => {
  const apply = (theme: unknown) => {
    addons.setConfig({
      theme: theme === 'light' ? strataThemes.light : strataThemes.dark
    })
  }
  apply(api.getGlobals().theme)
  api.on(GLOBALS_UPDATED, ({ globals }: GlobalsUpdatedPayload) =>
    apply(globals.theme)
  )
})

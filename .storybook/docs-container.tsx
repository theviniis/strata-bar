import { useEffect, useState, type PropsWithChildren } from 'react'
import type { GlobalsUpdatedPayload } from 'storybook/internal/types'
import {
  DocsContainer,
  type DocsContainerProps
} from '@storybook/addon-docs/blocks'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import { useDocumentTheme } from '../src/hooks/use-document-theme'
import { strataThemes } from './theme'

type Context = DocsContainerProps['context']

function selectedTheme(context: Context): 'light' | 'dark' {
  // Channel history also covers standalone MDX pages with no attached CSF meta.
  const last: unknown = context.channel.last(GLOBALS_UPDATED)
  const event: unknown = Array.isArray(last) ? last[0] : undefined
  if (event && typeof event === 'object' && 'globals' in event) {
    const globals = event.globals
    if (globals && typeof globals === 'object' && 'theme' in globals) {
      return globals.theme === 'light' ? 'light' : 'dark'
    }
  }
  const story = context.componentStories()[0]
  const theme = story
    ? context.getStoryContext(story).globals.theme
    : context.projectAnnotations.initialGlobals?.theme
  return theme === 'light' ? 'light' : 'dark'
}

/** Docs and canvases follow the same theme toolbar, including unattached MDX. */
export function StorybookDocsContainer({
  context,
  children
}: PropsWithChildren<DocsContainerProps>) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    selectedTheme(context)
  )
  useDocumentTheme({ theme, colorTheme: 'current' })
  useEffect(() => {
    const update = ({ globals }: GlobalsUpdatedPayload) => {
      setTheme(globals.theme === 'light' ? 'light' : 'dark')
    }
    context.channel.on(GLOBALS_UPDATED, update)
    return () => {
      context.channel.off(GLOBALS_UPDATED, update)
    }
  }, [context.channel])
  return (
    <DocsContainer context={context} theme={strataThemes[theme]}>
      {children}
    </DocsContainer>
  )
}

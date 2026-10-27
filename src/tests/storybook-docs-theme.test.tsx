import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Channel } from 'storybook/internal/channels'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import type { DocsContainerProps } from '@storybook/addon-docs/blocks'
import type { ReactNode } from 'react'
import { StorybookDocsContainer } from '../../.storybook/docs-container'

vi.mock('@storybook/addon-docs/blocks', () => ({
  DocsContainer: ({
    theme,
    children
  }: {
    theme: { base: string; appContentBg: string; colorPrimary: string }
    children: ReactNode
  }) => (
    <section
      aria-label="Documentação"
      data-theme={theme.base}
      data-background={theme.appContentBg}
      data-primary={theme.colorPrimary}
    >
      {children}
    </section>
  )
}))

function standaloneContext(channel: Channel) {
  // Only these context APIs are used by this container; real docs supply the rest.
  return {
    channel,
    componentStories: () => [],
    projectAnnotations: { initialGlobals: { theme: 'dark' } }
  } as unknown as DocsContainerProps['context']
}

it('starts standalone MDX in dark mode and follows toolbar changes both ways', () => {
  const channel = new Channel({})
  const view = render(
    <StorybookDocsContainer context={standaloneContext(channel)}>
      Guia MDX
    </StorybookDocsContainer>
  )
  const docs = screen.getByRole('region', { name: 'Documentação' })
  expect(docs).toHaveAttribute('data-theme', 'dark')
  expect(docs).toHaveAttribute('data-background', '#282936')
  expect(docs).toHaveAttribute('data-primary', '#fd73bf')
  act(() => channel.emit(GLOBALS_UPDATED, { globals: { theme: 'light' } }))
  expect(docs).toHaveAttribute('data-theme', 'light')
  expect(docs).toHaveAttribute('data-background', '#ffffff')
  act(() => channel.emit(GLOBALS_UPDATED, { globals: { theme: 'dark' } }))
  expect(docs).toHaveAttribute('data-theme', 'dark')
  view.unmount()
  expect(channel.listenerCount(GLOBALS_UPDATED)).toBe(0)
})

it('preserves a previously selected light theme when opening a standalone guide', () => {
  const channel = new Channel({})
  channel.emit(GLOBALS_UPDATED, { globals: { theme: 'light' } })
  render(
    <StorybookDocsContainer context={standaloneContext(channel)}>
      Guia MDX
    </StorybookDocsContainer>
  )
  expect(screen.getByRole('region', { name: 'Documentação' })).toHaveAttribute(
    'data-theme',
    'light'
  )
})

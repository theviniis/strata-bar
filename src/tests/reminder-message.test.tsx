import { render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ReminderMessage } from '@/features/reminders/ReminderMessage'

it('renders stored Markdown formatting, lists, quotes, code and links as read-only content', () => {
  const { container } = render(
    <ReminderMessage
      message={
        '## Heading\n\n**Bold** and *italic* and ~~removed~~\n\n- First\n- Second\n\n> Quoted\n\n`inline`\n\n[Docs](https://example.com)'
      }
    />
  )
  expect(
    screen.getByRole('heading', { level: 2, name: 'Heading' })
  ).toBeInTheDocument()
  expect(container.querySelector('strong')).toHaveTextContent('Bold')
  expect(container.querySelector('em')).toHaveTextContent('italic')
  expect(container.querySelector('s')).toHaveTextContent('removed')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(container.querySelector('blockquote')).toHaveTextContent('Quoted')
  expect(container.querySelector('code')).toHaveTextContent('inline')
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://example.com'
  )
  expect(container.querySelector('.tiptap')).toHaveAttribute(
    'contenteditable',
    'false'
  )
})

it('updates rendered content and does not insert executable HTML or script links', async () => {
  const { container, rerender } = render(
    <ReminderMessage message="**Original**" />
  )
  rerender(
    <ReminderMessage
      message={
        '**Updated**\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))'
      }
    />
  )
  await waitFor(() =>
    expect(container.querySelector('strong')).toHaveTextContent('Updated')
  )
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
})

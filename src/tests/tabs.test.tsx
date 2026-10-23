import { render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

it('does not restart the panel entrance when an input value changes', async () => {
  function Example({ value, tab }: { value: string; tab: string }) {
    return (
      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="first">First panel</TabsContent>
        <TabsContent value="second">
          <input aria-label="Value" value={value} readOnly />
        </TabsContent>
      </Tabs>
    )
  }
  const view = render(<Example value="before" tab="first" />)
  view.rerender(<Example value="before" tab="second" />)
  await waitFor(() =>
    expect(screen.getByRole('tabpanel')).toHaveStyle({ opacity: '1' })
  )
  const panel = screen.getByRole('tabpanel')
  view.rerender(<Example value="after" tab="second" />)
  expect(screen.getByRole('tabpanel')).toBe(panel)
  expect(panel).toHaveStyle({ opacity: '1' })
  expect(screen.getByLabelText('Value')).toHaveValue('after')
})

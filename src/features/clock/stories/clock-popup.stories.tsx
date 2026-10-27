import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import { ClockPopup } from '../popup/clock.popup'
import { clockFixture } from '../src/fixtures'
import { timePresentation } from '../src/presentation'

const fixture = clockFixture()
const meta = {
  tags: ['autodocs'],
  title: 'Popups/Clock',
  component: ClockPopup,
  args: {
    time: fixture,
    calendarMonth: fixture.now,
    selectedDate: fixture.now,
    onDateSelect: fn()
  },
  decorators: [
    (Story) => (
      <Card className="w-155">
        <Story />
      </Card>
    )
  ]
} satisfies Meta<typeof ClockPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Calendar: Story = {}
function ControlledClock() {
  const [now, setNow] = useState(clockFixture().now)
  const time = timePresentation(now, 'pt-BR')
  return (
    <>
      <Button onClick={() => setNow(new Date(now.getTime() + 86400000))}>
        Avançar um dia
      </Button>
      <ClockPopup
        time={time}
        calendarMonth={now}
        selectedDate={now}
        onDateSelect={() => {}}
      />
    </>
  )
}
export const Controlled: Story = { render: () => <ControlledClock /> }

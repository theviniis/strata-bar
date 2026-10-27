import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import { AgentQuestion } from '../src/agent-question'
import { agentQuestionFixture } from '../src/fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Agents/Question',
  component: AgentQuestion,
  args: {
    question: agentQuestionFixture(),
    answers: new Map([['path', 'src/']]),
    pending: false,
    attempted: false,
    error: null,
    blocked: false,
    valid: true,
    onSubmit: fn(),
    onAnswerChange: fn()
  }
} satisfies Meta<typeof AgentQuestion>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Pending: Story = { args: { pending: true, blocked: true } }
export const Error: Story = {
  args: { error: 'Resposta sem confirmação', attempted: true, blocked: true }
}
export const Interactive: Story = {
  render: function QuestionDemo(args) {
    const [answers, setAnswers] = useState(new Map<string, string>())
    const [attempted, setAttempted] = useState(false)
    return (
      <AgentQuestion
        {...args}
        answers={answers}
        valid={!!answers.get('path')?.trim()}
        attempted={attempted}
        blocked={attempted}
        onAnswerChange={(key, value) =>
          setAnswers((previous) => new Map(previous).set(key, value))
        }
        onSubmit={(event) => {
          event.preventDefault()
          setAttempted(true)
        }}
      />
    )
  }
}

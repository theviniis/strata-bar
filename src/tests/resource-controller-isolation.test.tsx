import { Profiler } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CpuController } from '@/features/cpu/widget/cpu.controller'
import { MemoryController } from '@/features/memory/widget/memory.controller'
import { cpuFixture, CPU_FIXTURE_TIME } from '@/features/cpu/src/fixtures'
import { memoryFixture } from '@/features/memory/src/fixtures'
const runtime = vi.hoisted(() => ({
  emit: new Map<string, (event: unknown) => void>()
}))
vi.mock('@/services/system/bridge', async (original) => ({
  ...(await original<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native' },
  connect: (
    _bridge: unknown,
    channel: string,
    _options: unknown,
    onValue: (event: unknown) => void
  ) => {
    runtime.emit.set(channel, onValue)
    return () => runtime.emit.delete(channel)
  }
}))
vi.mock('@/services/system/overlay', () => ({
  overlay: { mode: 'demo', hide: vi.fn(async () => {}) }
}))
afterEach(() => {
  runtime.emit.clear()
  vi.useRealTimers()
})
it('updates each resource widget independently and releases both subscriptions', () => {
  vi.useFakeTimers()
  vi.setSystemTime(CPU_FIXTURE_TIME)
  const cpuRender = vi.fn()
  const memoryRender = vi.fn()
  const view = render(
    <>
      <Profiler id="cpu" onRender={cpuRender}>
        <CpuController />
      </Profiler>
      <Profiler id="memory" onRender={memoryRender}>
        <MemoryController />
      </Profiler>
    </>
  )
  cpuRender.mockClear()
  memoryRender.mockClear()
  act(() => runtime.emit.get('cpu')?.({ status: 'ready', data: cpuFixture() }))
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('25.5%')
  expect(cpuRender).toHaveBeenCalled()
  expect(memoryRender).not.toHaveBeenCalled()
  cpuRender.mockClear()
  act(() =>
    runtime.emit.get('memory')?.({
      status: 'ready',
      data: memoryFixture(CPU_FIXTURE_TIME)
    })
  )
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('53.1%')
  expect(memoryRender).toHaveBeenCalled()
  expect(cpuRender).not.toHaveBeenCalled()
  view.unmount()
  expect(runtime.emit.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

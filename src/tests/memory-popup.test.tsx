import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MemoryPopup } from '../features/memory/popup/memory.popup'

const ready = (value: number) => ({
  status: 'ready' as const,
  value,
  updatedAt: 100000,
  error: null
})
const memory = {
  sequence: 1,
  sampledAt: 100000,
  totalBytes: ready(17179869184),
  availableBytes: ready(6442450944),
  usedBytes: ready(9663676416),
  cachedBytes: ready(4294967296),
  pagingFileBytes: ready(1073741824),
  percent: ready(56.25),
  history: []
}

it('shows total and available physical RAM without inventing a loading value', () => {
  render(
    <MemoryPopup
      event={{ status: 'loading' }}
      lastData={undefined}
      now={100000}
      demo={false}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando memória')
  expect(screen.queryByText('0.0 GiB')).not.toBeInTheDocument()
})

it('shows distinct physical memory and paging-file readings in GiB', () => {
  render(
    <MemoryPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data: memory }}
      now={100000}
    />
  )
  expect(screen.getByText('16.0 GiB')).toBeInTheDocument()
  expect(screen.getByText('6.0 GiB')).toBeInTheDocument()
  expect(screen.getByText('9.0 GiB')).toBeInTheDocument()
  expect(screen.getByText('4.0 GiB')).toBeInTheDocument()
  expect(screen.getByText('1.0 GiB')).toBeInTheDocument()
  expect(screen.getByText('56.3%')).toBeInTheDocument()
})

it('keeps physical readings when cache fails and distinguishes an absent paging file', () => {
  render(
    <MemoryPopup
      lastData={undefined}
      demo={false}
      event={{
        status: 'ready',
        data: {
          ...memory,
          cachedBytes: {
            ...ready(4294967296),
            status: 'error',
            error: 'Counter offline'
          },
          pagingFileBytes: {
            status: 'notConfigured',
            value: null,
            updatedAt: 100000,
            error: null
          }
        }
      }}
      now={100000}
    />
  )
  expect(screen.getByText('16.0 GiB')).toBeInTheDocument()
  expect(screen.getByText(/4.0 GiB.*desatualizada/)).toBeInTheDocument()
  expect(screen.getByText('Não configurado')).toBeInTheDocument()
})

it('exposes the observed window and preserves its gaps', () => {
  render(
    <MemoryPopup
      lastData={undefined}
      demo={false}
      event={{
        status: 'ready',
        data: {
          ...memory,
          sequence: 4,
          history: [
            { sequence: 1, timestamp: -40000, percent: 90 },
            { sequence: 2, timestamp: 96000, percent: 40 },
            { sequence: 3, timestamp: 98000, percent: null },
            { sequence: 4, timestamp: 100000, percent: 56.25 }
          ]
        }
      }}
      now={100000}
    />
  )
  expect(screen.getByRole('group', { name: /últimos 2 minutos/ })).toBeVisible()
  expect(screen.getByText(/1 leitura indisponível/)).toBeInTheDocument()
})

it('identifies the last successful reading as stale after transport failure', () => {
  render(
    <MemoryPopup
      demo={false}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={memory}
      now={110000}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('IPC offline')
  expect(screen.getByText('16.0 GiB · desatualizada')).toBeInTheDocument()
  expect(screen.queryByText('0.0 GiB')).not.toBeInTheDocument()
})

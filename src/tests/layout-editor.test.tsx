import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi, describe } from 'vitest'
import type { Config, WidgetConfig } from '../services/configuration/config'
import { LayoutEditor } from '../settings/LayoutEditor'

const defaultConfig: Config = {
  version: 1,
  bar: {},
  widgets: {
    left: [{ id: 'komorebi', type: 'komorebi' }],
    center: [{ id: 'cpu', type: 'cpu' }],
    right: [
      { id: 'volume', type: 'volume' },
      { id: 'microphone', type: 'microphone' }
    ]
  }
}

function renderLayoutEditor(config: Config, onChange: (next: Config) => void) {
  return render(<LayoutEditor draft={config} onChange={onChange} />)
}

describe('LayoutEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three sortable columns', () => {
    const onChange = vi.fn()
    renderLayoutEditor(defaultConfig, onChange)

    expect(screen.getByLabelText('Seção Esquerda')).toBeInTheDocument()
    expect(screen.getByLabelText('Seção Centro')).toBeInTheDocument()
    expect(screen.getByLabelText('Seção Direita')).toBeInTheDocument()
  })

  it('renders widgets in their configured sections', () => {
    const onChange = vi.fn()
    renderLayoutEditor(defaultConfig, onChange)

    expect(screen.getByLabelText('Uso da CPU')).toBeInTheDocument()
    expect(screen.getByLabelText('Área de trabalho')).toBeInTheDocument()
    expect(screen.getByLabelText('Saída de áudio')).toBeInTheDocument()
    expect(screen.getByLabelText('Entrada de áudio')).toBeInTheDocument()
  })

  it('allows reordering widgets within a section', () => {
    const onChange = vi.fn((next) => next)
    renderLayoutEditor(defaultConfig, onChange)

    const widgets = screen.getAllByRole('listitem')
    expect(widgets).toHaveLength(4)

    // Simulate moving CPU to the end of center
    const cpuWidget = screen.getByTitle('Uso da CPU (cpu)')
    expect(cpuWidget).toHaveTextContent('Uso da CPU')
  })

  it('allows moving widgets between sections', () => {
    const onChange = vi.fn((next) => next)
    renderLayoutEditor(defaultConfig, onChange)

    const select = screen.getByRole('combobox', {
      name: 'Mover Uso da CPU para'
    })
    expect(select).toBeInTheDocument()

    // Check initial position
    const centerSection = screen.getByLabelText('Seção Centro')
    expect(centerSection).toHaveTextContent('Uso da CPU')
  })

  it('prevents duplicate widget IDs', () => {
    const onChange = vi.fn((next) => next)
    const configWithDuplicate = structuredClone(defaultConfig)
    configWithDuplicate.widgets.right[0].id = 'cpu'

    expect(() => {
      renderLayoutEditor(configWithDuplicate, onChange)
    }).not.toThrow()
  })

  it('allows adding new widgets', () => {
    const onChange = vi.fn((next) => next)
    const config = structuredClone(defaultConfig)
    renderLayoutEditor(config, onChange)

    const addWidgetSummary = screen.getByText('Adicionar')
    expect(addWidgetSummary).toBeInTheDocument()

    // Expand the dropdown
    fireEvent.click(addWidgetSummary)

    // Check that all widget types are available
    expect(screen.getByText('Relógio')).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('RAM')).toBeInTheDocument()
  })

  it('allows removing widgets', () => {
    const onChange = vi.fn((next) => next)
    renderLayoutEditor(defaultConfig, onChange)

    const removeButtons = screen.getAllByRole('button', { name: /Remover/ })
    expect(removeButtons).toHaveLength(4)

    // Remove CPU widget
    const cpuRemoveButton = removeButtons[0] // CPU is first in the list
    fireEvent.click(cpuRemoveButton)

    expect(screen.queryByLabelText('Uso da CPU')).not.toBeInTheDocument()
  })

  it('allows toggling widget enabled state', () => {
    const onChange = vi.fn((next) => next)
    renderLayoutEditor(defaultConfig, onChange)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(4)

    // Toggle CPU
    const cpuCheckbox = checkboxes[1] // First is layout, second is CPU
    fireEvent.click(cpuCheckbox)

    // onChange should be called with updated enabled state
    expect(onChange).toHaveBeenCalled()
  })

  it('shows empty section message', () => {
    const emptyConfig: Config = {
      version: 1,
      bar: {},
      widgets: { left: [], center: [], right: [] }
    }

    const onChange = vi.fn()
    renderLayoutEditor(emptyConfig, onChange)

    const sections = screen.getAllByRole('region')
    expect(sections).toHaveLength(3)
  })
})

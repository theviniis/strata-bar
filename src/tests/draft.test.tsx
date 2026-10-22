import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  useConfigEditor,
  draftFromText,
  type ConfigPersistence
} from '../settings/draft'
import { defaultConfig } from '../services/configuration/config'

function Editor({ persistence }: { persistence: ConfigPersistence }) {
  const editor = useConfigEditor(persistence)
  return (
    <>
      <button
        disabled={editor.loading || !!editor.error}
        onClick={editor.apply}
      >
        Apply
      </button>
      <button
        onClick={() => {
          const invalid = structuredClone(defaultConfig)
          invalid.bar.height = 900
          editor.replaceDraft(invalid)
        }}
      >
        Invalid height
      </button>
      <button
        onClick={() => {
          const invalid = structuredClone(defaultConfig)
          invalid.widgets.left.push({ ...invalid.widgets.right[0] })
          editor.replaceDraft(invalid)
        }}
      >
        Duplicate ID
      </button>
      {editor.error && <p role="alert">{editor.error.message}</p>}
    </>
  )
}

describe('draft validation', () => {
  it.each(['Invalid height', 'Duplicate ID'])(
    'blocks saving a draft with %s',
    async (name) => {
      const persistence = {
        load: vi.fn().mockResolvedValue(defaultConfig),
        save: vi.fn()
      }
      render(<Editor persistence={persistence} />)
      await waitFor(() => expect(screen.getByText('Apply')).toBeEnabled())
      await act(async () => {
        fireEvent.click(screen.getByText(name))
      })
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/)
      expect(screen.getByText('Apply')).toBeDisabled()
      fireEvent.click(screen.getByText('Apply'))
      expect(persistence.save).not.toHaveBeenCalled()
    }
  )

  it('parses valid JSON and reports malformed documents', () => {
    expect(draftFromText(JSON.stringify(defaultConfig))).toEqual(defaultConfig)
    expect(draftFromText('{ invalid')).toMatchObject({ source: 'field' })
    expect(
      draftFromText(JSON.stringify({ ...defaultConfig, bar: { height: 900 } }))
    ).toMatchObject({
      source: 'field',
      message: expect.stringContaining('height')
    })
  })
})

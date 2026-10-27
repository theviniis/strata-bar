import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react'
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
  it('shares visual and JSON edits, preserves saved state on rejection and reloads on Revert', async () => {
    const persistence = {
      load: vi.fn().mockResolvedValue(structuredClone(defaultConfig)),
      save: vi.fn().mockRejectedValue(new Error('Write failed'))
    }
    const { result } = renderHook(() => useConfigEditor(persistence))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const visual = structuredClone(result.current.draft)
    visual.bar.height = 40
    await act(async () => result.current.replaceDraft(visual))
    expect(JSON.parse(result.current.jsonText).bar.height).toBe(40)
    const json = { ...visual, bar: { ...visual.bar, height: 42 } }
    await act(async () => result.current.replaceText(JSON.stringify(json)))
    expect(result.current.draft.bar.height).toBe(42)
    expect(persistence.save).not.toHaveBeenCalled()
    await act(async () => result.current.replaceText('{ invalid'))
    act(() => result.current.apply())
    expect(persistence.save).not.toHaveBeenCalled()
    expect(result.current.draft.bar.height).toBe(42)
    await act(async () => result.current.replaceText(JSON.stringify(json)))
    await act(async () => result.current.apply())
    expect(persistence.save).toHaveBeenCalledWith(json)
    expect(result.current.error?.message).toBe('Write failed')
    expect(result.current.saved).toEqual(defaultConfig)
    const external = { ...json, bar: { ...json.bar, height: 44 } }
    persistence.load.mockResolvedValue(external)
    await act(async () => result.current.revert())
    expect(result.current.draft).toEqual(external)
    expect(JSON.parse(result.current.jsonText)).toEqual(external)
    expect(result.current.error).toBeNull()
  })

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

import { describe, it, expect, beforeEach, vi, act } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  firstError,
  draftFromText,
  useConfigEditor,
  type ConfigEditor
} from '../settings/draft'
import {
  configSchema,
  defaultConfig,
  parseConfig
} from '../services/configuration/config'

describe('draft', () => {
  describe('firstError', () => {
    it('returns null for empty errors', () => {
      expect(firstError(null)).toBeNull()
      expect(firstError(undefined)).toBeNull()
      expect(firstError({})).toBeNull()
    })

    it('flattens nested error messages', () => {
      const errors = {
        widgets: {
          left: [{ message: 'Widget ID must be unique' }]
        }
      }
      expect(firstError(errors)).toBe('Widget ID must be unique')
    })

    it('returns first string message from complex structure', () => {
      const errors = {
        bar: {
          height: { message: 'Height must be between 28 and 64' }
        },
        widgets: {
          right: [{ message: 'Invalid widget type' }]
        }
      }
      expect(firstError(errors)).toBe('Height must be between 28 and 64')
    })
  })

  describe('draftFromText', () => {
    it('parses valid config', () => {
      const result = draftFromText(JSON.stringify(defaultConfig))
      expect((result as any).version).toBe(1)
    })

    it('returns error for invalid JSON', () => {
      const result = draftFromText('{ invalid json')
      expect(result).toMatchObject({
        source: 'field',
        message: expect.any(String)
      })
    })

    it('returns error for invalid schema', () => {
      const invalid = { ...defaultConfig, bar: { height: 900 } }
      const result = draftFromText(JSON.stringify(invalid))
      expect(result).toMatchObject({
        source: 'field',
        message: expect.stringContaining('height')
      })
    })
  })

  describe('useConfigEditor with mock persistence', () => {
    let mockPersistence: {
      load: () => Promise<any>
      save: (config: any) => Promise<any>
    }

    beforeEach(() => {
      mockPersistence = {
        load: vi.fn().mockResolvedValue(defaultConfig),
        save: vi.fn().mockResolvedValue(defaultConfig)
      }
    })

    it('loads initial config on mount', () => {
      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      expect(mockPersistence.load).toHaveBeenCalled()
      expect(result.current.saved).toEqual(defaultConfig)
    })

    it('applies valid draft', async () => {
      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      // Modify draft
      const modified = structuredClone(defaultConfig)
      modified.bar.theme = 'light'
      result.current.replaceDraft(modified)

      // Apply
      result.current.apply()
      await act(async () => {})

      expect(mockPersistence.save).toHaveBeenCalledWith(modified)
    })

    it('reverts to saved config', () => {
      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      const modified = structuredClone(defaultConfig)
      modified.bar.theme = 'light'
      result.current.replaceDraft(modified)

      result.current.revert()
      expect(result.current.saved).toEqual(defaultConfig)
    })

    it('restores defaults and applies', async () => {
      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      const modified = structuredClone(defaultConfig)
      modified.bar.theme = 'light'
      result.current.replaceDraft(modified)

      result.current.restoreDefaults()
      await act(async () => {})

      expect(result.current.saved).toEqual(defaultConfig)
    })

    it('shows field error for invalid draft', () => {
      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      // Invalid config: height out of range
      const invalid = structuredClone(defaultConfig)
      invalid.bar.height = 900
      result.current.replaceDraft(invalid)

      expect(result.current.error).not.toBeNull()
      expect(result.current.error?.source).toBe('field')
    })

    it('shows native error from save', async () => {
      mockPersistence.save = vi
        .fn()
        .mockRejectedValue(new Error('Native save failed'))

      const { result } = renderHook(() =>
        useConfigEditor(mockPersistence as any)
      )

      result.current.apply()
      await act(async () => {})

      expect(result.current.error).not.toBeNull()
      expect(result.current.error?.source).toBe('native')
    })
  })
})

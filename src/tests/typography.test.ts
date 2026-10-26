import { describe, expect, it } from 'vitest'
import { cn } from '../lib/utils'

describe('typography class merging', () => {
  it.each([
    'micro',
    'bar',
    'body',
    'control',
    'subtitle',
    'title',
    'page',
    'clock-display',
    'studio-display'
  ])('keeps text-%s alongside a foreground colour', (role) => {
    expect(cn(`text-${role}`, 'text-muted-foreground')).toBe(
      `text-${role} text-muted-foreground`
    )
    expect(cn('text-[#e4e5ed]', `text-${role}`)).toBe(
      `text-[#e4e5ed] text-${role}`
    )
  })

  it('lets a caller override size without removing colour or weight', () => {
    expect(cn('text-bar font-medium text-foreground', 'text-micro')).toBe(
      'font-medium text-foreground text-micro'
    )
    expect(cn('text-title text-foreground', 'md:text-body')).toBe(
      'text-title text-foreground md:text-body'
    )
  })
})

import { useEffect, useRef, type RefObject } from 'react'
import type { Config } from '@/services/configuration/config'
import { islandRegion } from '@/components/status-bar/bar-region'
import { cornerRadius } from '@/components/status-bar/curves'

/** Native window regions pass input to other processes, unlike CSS pointer-events. */
export function useBarRegion(
  ref: RefObject<HTMLElement | null>,
  bar: Config['bar'],
  preview: boolean,
  filled = false
) {
  const wasFilled = useRef(false)
  useEffect(() => {
    if (preview || !('__TAURI_INTERNALS__' in window)) return
    const root = ref.current
    if (!root) return
    let stopped = false
    let frame = 0
    let last = ''
    // Keep the HWND paint area through the fade-out. Removing it immediately
    // would clip the CSS transition back to the island silhouettes.
    let keepFilled = filled || wasFilled.current
    wasFilled.current = filled
    const fadeOut =
      !filled && keepFilled
        ? setTimeout(
            () => {
              keepFilled = false
              update()
            },
            bar.reduceMotion ||
              window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 0
              : 300
          )
        : undefined
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const polygons = Array.from(
          root.querySelectorAll<HTMLElement>('[data-section]')
        ).flatMap((section) => {
          if (
            !section.children.length ||
            !section.querySelector('[data-bar-item], [role="alert"]')
          )
            return []
          const rect = section.getBoundingClientRect()
          return islandRegion(
            { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            section.dataset.section!,
            cornerRadius(bar),
            bar.position === 'bottom',
            bar.desktopCorners !== false
          )
        })
        if (keepFilled) {
          const rect = root.getBoundingClientRect()
          polygons.push([
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.top },
            { x: rect.right, y: rect.bottom },
            { x: rect.left, y: rect.bottom }
          ])
        }
        // A widget can extend beyond a curved background edge; its actual
        // rectangle must remain interactive independently of the island mask.
        root
          .querySelectorAll<HTMLElement>('[data-bar-item], [role="alert"]')
          .forEach((node) => {
            const rect = node.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0)
              polygons.push([
                { x: rect.left, y: rect.top },
                { x: rect.right, y: rect.top },
                { x: rect.right, y: rect.bottom },
                { x: rect.left, y: rect.bottom }
              ])
          })
        const signature = JSON.stringify({
          polygons,
          scale: window.devicePixelRatio
        })
        if (signature === last) return
        last = signature
        void import('@tauri-apps/api/core')
          .then(({ invoke }) => {
            if (!stopped) return invoke('bar_set_region', { polygons })
          })
          .catch((error) => {
            last = ''
            console.error('Bar input region:', error)
          })
      })
    }
    const resize = new ResizeObserver(update)
    resize.observe(root)
    const observeSections = () => {
      root
        .querySelectorAll<HTMLElement>('[data-section]')
        .forEach((node) => resize.observe(node))
      update()
    }
    const mutation = new MutationObserver(observeSections)
    mutation.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    })
    window.addEventListener('resize', update)
    observeSections()
    return () => {
      stopped = true
      clearTimeout(fadeOut)
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, bar, preview, filled])
}

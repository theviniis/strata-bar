import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import type { MediaSpectrumData } from '@/services/system/media.generated'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

const idleBands = [0, 0, 0, 0, 0, 0]

const HIDE_TIMEOUT = 30_000
const spectrumClasses =
  'flex shrink-0 self-stretch items-center justify-center gap-1 overflow-hidden rounded-full bg-transparent text-secondary py-1'
const bandClasses = 'w-px shrink-0 self-stretch rounded-full bg-current'

export function MediaSpectrum({
  data,
  demo = false
}: {
  data: MediaSpectrumData | null
  demo?: boolean
}) {
  const preview = useWidgetPreview()
  const reducedMotion = useReducedMotion()
  const [visible, setVisible] = useState(data !== null)
  if (data && !visible) setVisible(true)

  const playing = data !== null
  useEffect(() => {
    if (preview || playing) return
    const timeout = setTimeout(() => setVisible(false), HIDE_TIMEOUT)
    return () => clearTimeout(timeout)
  }, [playing, preview])

  if (preview)
    return data ? (
      <div
        role="img"
        aria-label="Espectro de mídia · demonstração"
        title="Demonstração · dados ilustrativos"
        className={spectrumClasses}
        style={{ paddingInline: 8 }}
      >
        {data.bands.map((value, index) => (
          <span
            key={index}
            aria-hidden="true"
            data-spectrum-band={index}
            className={bandClasses}
            style={{ transform: `scaleY(${0.05 + value * 0.95})` }}
          />
        ))}
      </div>
    ) : null

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="spectrum"
          role="img"
          aria-label={
            demo ? 'Espectro de mídia · demonstração' : 'Espectro de mídia'
          }
          title={
            demo
              ? 'Demonstração · dados ilustrativos'
              : 'Frequências do player ativo'
          }
          className={spectrumClasses}
          initial={
            reducedMotion ? false : { scaleX: 0, width: 0, paddingInline: 0 }
          }
          animate={{ scaleX: 1, width: 'auto', paddingInline: 8 }}
          exit={{ scaleX: 0, width: 0, paddingInline: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.12 }}
        >
          {(data?.bands ?? idleBands).map((value, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              data-spectrum-band={index}
              className={bandClasses}
              initial={false}
              animate={{ scaleY: 0.05 + value * 0.95 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.08, ease: 'easeOut' }
              }
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

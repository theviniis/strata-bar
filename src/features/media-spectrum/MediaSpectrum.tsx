import type { MediaSpectrumData } from '@/services/system/media.generated'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export function MediaSpectrum({
  data,
  demo = false
}: {
  data: MediaSpectrumData | null
  demo?: boolean
}) {
  const reducedMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {data && (
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
          className="flex h-6 shrink-0 items-center justify-center gap-1 px-2 text-secondary"
          initial={reducedMotion ? false : { opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.12 }}
        >
          {data.bands.map((value, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              data-spectrum-band={index}
              className="h-5 w-px shrink-0 rounded-full bg-current"
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

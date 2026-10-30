import type { QueryClient } from '@tanstack/react-query'
import {
  bridge,
  type Channel,
  type NativeBridge
} from '@/services/system/bridge'
import { retainChannel } from '@/services/system/widget-runtime'
import { popupMetadata, type PopupId } from './resolve'

const channels: Partial<Record<PopupId, readonly Channel[]>> = {
  cpu: ['cpu'],
  gpu: ['gpu'],
  memory: ['memory'],
  disk: ['disk'],
  network: ['network'],
  weather: ['weather'],
  music: ['media'],
  audioOutputs: ['audioOutputs', 'volume'],
  audioInputs: ['audioInputs', 'microphone']
}

/** Prepare the content, not an animated loading shell. No live interest survives
 * this preparation; mounted content owns the ongoing subscriptions. */
export async function preparePopup(id: PopupId, queries: QueryClient) {
  if (bridge.mode !== 'native') return
  await Promise.all([
    popupMetadata(id).Content.preload?.(),
    ...(channels[id] ?? []).map(async (channel) => {
      try {
        const stop = await (bridge as NativeBridge).subscribe(
          channel,
          (event) => retainChannel(channel, event),
          { intervalMs: 2000 }
        )
        await stop()
      } catch (error) {
        retainChannel(channel, { status: 'error', error: String(error) })
      }
    }),
    id === 'reminders'
      ? (async () => {
          const [{ getRemindersStore }, { calendar }] = await Promise.all([
            import('@/stores/reminders'),
            import('@/services/system/calendar')
          ])
          await Promise.all([
            getRemindersStore().getState().refresh(),
            queries
              .fetchQuery({
                queryKey: ['calendar', 'status', true],
                queryFn: calendar.status
              })
              .catch(() => {})
          ])
        })()
      : undefined,
    id === 'agents'
      ? import('@/stores/agents').then(({ getAgentsStore }) =>
          getAgentsStore().getState().refresh()
        )
      : undefined
  ])
}

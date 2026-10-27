import { afterEach, expect, it, vi } from 'vitest'
import { MusicInteractions } from '@/features/music/interactions'
import { demoMedia } from '@/services/system/media'
import type { MediaRequest } from '@/services/system/media.generated'

function transport() {
  const requests: {
    request: MediaRequest
    finish(): void
    fail(error: Error): void
  }[] = []
  const send = vi.fn(
    (request: MediaRequest) =>
      new Promise<void>((finish, fail) => {
        requests.push({ request, finish, fail })
      })
  )
  const finish = async (index: number) => {
    requests[index].finish()
    await Promise.resolve()
  }
  const fail = async (index: number) => {
    requests[index].fail(new Error('Rejected'))
    await Promise.resolve()
  }
  return { requests, send, finish, fail }
}

afterEach(() => vi.useRealTimers())

it('serializes volume and mute, coalescing only between mute fences', async () => {
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const close = music.open()
  music.setVolume(70)
  music.setVolume(80)
  music.setVolume(90)
  const mute = music.dispatch({ action: 'mute', muted: true })
  music.setVolume(20)
  music.setVolume(30)
  expect(native.send).toHaveBeenCalledTimes(1)
  expect(music.getSnapshot()).toMatchObject({
    volumeDraft: 30,
    muteDraft: true,
    pending: { volume: true }
  })
  await native.finish(0)
  await native.finish(1)
  await native.finish(2)
  await native.finish(3)
  expect(await mute).toBe(true)
  expect(native.requests.map(({ request }) => request.action)).toEqual([
    { action: 'volume', level: 70 },
    { action: 'volume', level: 90 },
    { action: 'mute', muted: true },
    { action: 'volume', level: 30 }
  ])
  expect(music.getSnapshot().pending.volume).toBe(false)
  close()
})

it('keeps playback and favorites independent from an in-flight volume request', async () => {
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const close = music.open()
  music.setVolume(70)
  const playback = music.dispatch({ action: 'playPause' })
  const favorite = music.dispatch({ action: 'favorite', saved: true })
  expect(native.requests).toHaveLength(3)
  await native.finish(1)
  await native.finish(2)
  expect(await playback).toBe(true)
  expect(await favorite).toBe(true)
  expect(music.getSnapshot().pending).toMatchObject({
    volume: true,
    playback: false,
    favorite: false
  })
  close()
  await native.finish(0)
})

it('drops unsent seeks and volume values on close and ignores late failures after reopening', async () => {
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const close = music.open()
  const oldPlayback = music.dispatch({ action: 'playPause' })
  const queuedSeek = music.dispatch({ action: 'seek', positionMs: 90000 })
  music.setVolume(70)
  music.setVolume(90)
  close()
  expect(await queuedSeek).toBe(false)
  const closeNew = music.open()
  const newPlayback = music.dispatch({ action: 'next' })
  await native.fail(0)
  await native.finish(1)
  expect(await oldPlayback).toBe(false)
  expect(native.requests).toHaveLength(3)
  expect(music.getSnapshot()).toMatchObject({
    error: '',
    pending: { playback: true, volume: false }
  })
  await native.finish(2)
  expect(await newPlayback).toBe(true)
  closeNew()
})

it('does not let an old cleanup close a newer lifetime', async () => {
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const closeOld = music.open()
  const closeNew = music.open()
  closeOld()
  const result = music.dispatch({ action: 'next' })
  expect(native.requests).toHaveLength(1)
  await native.finish(0)
  expect(await result).toBe(true)
  closeNew()
  expect(await music.dispatch({ action: 'next' })).toBe(false)
})

it('retains optimistic volume through a slow write and stale echoes, then expires it after completion', async () => {
  vi.useFakeTimers()
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const close = music.open()
  music.observeVolume(64, false)
  music.setVolume(90)
  vi.advanceTimersByTime(10_000)
  expect(music.getSnapshot().volumeDraft).toBe(90)
  await native.finish(0)
  vi.advanceTimersByTime(2999)
  expect(music.getSnapshot().volumeDraft).toBe(90)
  vi.advanceTimersByTime(1)
  expect(music.getSnapshot().volumeDraft).toBeNull()
  close()
  expect(vi.getTimerCount()).toBe(0)
})

it('releases volume and mute drafts on acknowledgement and permits retry after rejection', async () => {
  vi.useFakeTimers()
  const native = transport()
  const music = new MusicInteractions(demoMedia(), native.send)
  const close = music.open()
  music.setVolume(70)
  const mute = music.dispatch({ action: 'mute', muted: true })
  music.observeVolume(70, true)
  await native.finish(0)
  await native.finish(1)
  expect(await mute).toBe(true)
  vi.advanceTimersByTime(0)
  expect(music.getSnapshot()).toMatchObject({
    volumeDraft: null,
    muteDraft: null
  })
  music.setVolume(90)
  music.setVolume(95)
  await native.fail(2)
  expect(native.requests).toHaveLength(3)
  expect(music.getSnapshot()).toMatchObject({
    error: 'Error: Rejected',
    volumeDraft: null,
    pending: { volume: false }
  })
  music.setVolume(90)
  expect(native.requests).toHaveLength(4)
  close()
  await native.finish(3)
})

it('captures only the original session and track in each request', async () => {
  const native = transport()
  const media = demoMedia()
  const original = { sessionId: media.sessionId, trackId: media.trackId }
  const music = new MusicInteractions(media, native.send)
  const close = music.open()
  media.trackId = 'changed'
  const action = music.dispatch({ action: 'playPause' })
  expect(native.requests[0].request).toEqual({
    ...original,
    action: { action: 'playPause' }
  })
  await native.finish(0)
  expect(await action).toBe(true)
  close()
})

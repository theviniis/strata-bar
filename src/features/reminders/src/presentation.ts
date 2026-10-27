export function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function scheduledDateTime(
  date: Date | undefined,
  time: string
): number {
  if (!date || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Selecione uma data e um horário válidos')
  const [hours, minutes] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59) throw new Error('Horário inválido')
  const value = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes
  )
  if (value.getHours() !== hours || value.getMinutes() !== minutes)
    throw new Error('Esse horário não existe no fuso local')
  return value.getTime()
}

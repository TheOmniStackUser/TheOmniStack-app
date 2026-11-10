/**
 * Generates an array of formatted "HH:MM" timestamps spaced by intervalMinutes
 * between startStr and endStr (inclusive).
 */
export function generateIntervalTimes(
  intervalMinutes: number,
  startStr: string = '08:00',
  endStr: string = '18:00'
): string[] {
  const [startH, startM] = (startStr || '08:00').split(':').map((v) => parseInt(v, 10))
  const [endH, endM] = (endStr || '18:00').split(':').map((v) => parseInt(v, 10))

  const startTotalMinutes = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM)
  const endTotalMinutes = (isNaN(endH) ? 18 : endH) * 60 + (isNaN(endM) ? 0 : endM)

  const step = intervalMinutes > 0 ? intervalMinutes : 60
  const result: string[] = []

  if (endTotalMinutes < startTotalMinutes) {
    return generateIntervalTimes(step, '08:00', '18:00')
  }

  for (let m = startTotalMinutes; m <= endTotalMinutes; m += step) {
    const hour = Math.floor(m / 60)
    const minute = m % 60
    if (hour >= 24) break
    const formatted = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    result.push(formatted)
  }

  if (result.length === 0) {
    result.push('08:00')
  }

  return result
}

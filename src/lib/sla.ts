/**
 * SLA & Marketplace Deadline Calculation Helper
 * Handles marketplace response deadlines (e.g., OTTO 48h working days, Amazon 24h)
 */

export function calculateSlaDeadline(
  startDate: Date = new Date(),
  slaHours: number = 48,
  marketplace: string = 'otto'
): Date {
  const isBusinessHoursOnly = marketplace.toLowerCase() === 'otto'
  
  if (!isBusinessHoursOnly) {
    // Standard calendar hours (e.g. Amazon 24h)
    return new Date(startDate.getTime() + slaHours * 60 * 60 * 1000)
  }

  // OTTO SLA: 48 business hours (Monday to Friday)
  const deadline = new Date(startDate)
  let remainingHours = slaHours

  while (remainingHours > 0) {
    deadline.setTime(deadline.getTime() + 60 * 60 * 1000)
    const dayOfWeek = deadline.getDay() // 0 = Sunday, 6 = Saturday
    // Only count if it's Monday through Friday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remainingHours--
    }
  }

  return deadline
}

export type SlaStatus = {
  isOverdue: boolean
  remainingMs: number
  remainingHours: number
  remainingMinutes: number
  severity: 'safe' | 'warning' | 'urgent' | 'overdue' | 'resolved'
  label: string
  formattedDeadline: string
}

export function getSlaStatus(
  deadlineAt: Date | string | null | undefined,
  status: string = 'open'
): SlaStatus {
  if (status === 'in_progress') {
    return {
      isOverdue: false,
      remainingMs: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      severity: 'safe',
      label: 'In Bearbeitung',
      formattedDeadline: '',
    }
  }

  if (status !== 'open') {
    return {
      isOverdue: false,
      remainingMs: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      severity: 'resolved',
      label: status === 'answered' ? 'Beantwortet' : 'Geschlossen',
      formattedDeadline: '',
    }
  }

  if (!deadlineAt) {
    return {
      isOverdue: false,
      remainingMs: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      severity: 'safe',
      label: 'Keine Frist',
      formattedDeadline: '',
    }
  }

  const deadline = new Date(deadlineAt)
  const now = new Date()
  const diffMs = deadline.getTime() - now.getTime()
  const isOverdue = diffMs < 0
  const absDiffMinutes = Math.floor(Math.abs(diffMs) / (60 * 1000))
  const remainingHours = Math.floor(absDiffMinutes / 60)
  const remainingMinutes = absDiffMinutes % 60

  const formattedDeadline = deadline.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (isOverdue) {
    const overdueStr = remainingHours > 0 
      ? `Überfällig um ${remainingHours}h ${remainingMinutes}m` 
      : `Überfällig um ${remainingMinutes}m`
    return {
      isOverdue: true,
      remainingMs: diffMs,
      remainingHours: -remainingHours,
      remainingMinutes: -remainingMinutes,
      severity: 'overdue',
      label: overdueStr,
      formattedDeadline,
    }
  }

  // < 4 hours remaining: URGENT / Critical Penalty Risk
  if (remainingHours < 4) {
    return {
      isOverdue: false,
      remainingMs: diffMs,
      remainingHours,
      remainingMinutes,
      severity: 'urgent',
      label: `Dringend: noch ${remainingHours > 0 ? `${remainingHours}h ` : ''}${remainingMinutes}m`,
      formattedDeadline,
    }
  }

  // 4h - 24h: Warning
  if (remainingHours < 24) {
    return {
      isOverdue: false,
      remainingMs: diffMs,
      remainingHours,
      remainingMinutes,
      severity: 'warning',
      label: `noch ${remainingHours}h ${remainingMinutes}m`,
      formattedDeadline,
    }
  }

  // > 24h: Safe
  return {
    isOverdue: false,
    remainingMs: diffMs,
    remainingHours,
    remainingMinutes,
    severity: 'safe',
    label: `noch ${remainingHours}h`,
    formattedDeadline,
  }
}

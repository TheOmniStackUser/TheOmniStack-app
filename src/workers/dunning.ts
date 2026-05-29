import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { db } from '@/db/client'
import { companies, invoices, dunningRules, dunningLogs, dunningExclusions, invoiceLogs } from '@/db/schema'
import { eq, and, isNull, lt, desc } from 'drizzle-orm'
import { format, subDays, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { DunningEmail, type DunningStage } from '@/emails/DunningEmail'
import React from 'react'
import { getDocumentUrl } from '@/lib/storage'

// ─── Queue Name ───────────────────────────────────────────────────────────────
export const QUEUE_DUNNING = 'dunning-check'

export type DunningJobData = {
  companyId?: string // if omitted, runs for ALL companies
  triggeredByUserId?: string
}

// ─── Redis Client ─────────────────────────────────────────────────────────────
const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
redisConnection.on('error', (err) => {
  console.error('[Redis Error in dunning]', err)
})

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

// ─── Stage ordering ───────────────────────────────────────────────────────────
const STAGE_ORDER: DunningStage[] = ['reminder', 'first', 'second']

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a number as German currency string, e.g. "123,45 €"
 */
function formatAmount(amount: string | number, currency = 'EUR') {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(num)
}

/**
 * Replace template placeholders with real invoice values.
 * Supported: {Empfänger}, {Nummer}, {Datum}, {Fälligkeitsdatum}, {Betrag}, {Unternehmen}
 */
function resolveTemplate(
  template: string,
  vars: {
    recipientName: string
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    amount: string
    companyName: string
  }
) {
  return template
    .replace(/\{Empfänger\}/g, vars.recipientName)
    .replace(/\{Nummer\}/g, vars.invoiceNumber)
    .replace(/\{Datum\}/g, vars.invoiceDate)
    .replace(/\{Fälligkeitsdatum\}/g, vars.dueDate)
    .replace(/\{Betrag\}/g, vars.amount)
    .replace(/\{Unternehmen\}/g, vars.companyName)
}

// ─── Core Processing Logic ────────────────────────────────────────────────────

async function processDunningForCompany(
  companyId: string,
  triggeredByUserId?: string
): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const stats = { processed: 0, sent: 0, skipped: 0, failed: 0 }

  // 1. Load company
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    console.warn(`[Dunning] Company ${companyId} not found. Skipping.`)
    return stats
  }

  // 2. Load active dunning rules for this company
  const rules = await db
    .select()
    .from(dunningRules)
    .where(and(eq(dunningRules.companyId, companyId), eq(dunningRules.isEnabled, true)))

  if (rules.length === 0) {
    console.log(`[Dunning] No enabled rules for ${company.name}. Skipping.`)
    return stats
  }

  // 3. Load exclusion list for this company
  const exclusions = await db
    .select({ recipientEmail: dunningExclusions.recipientEmail })
    .from(dunningExclusions)
    .where(eq(dunningExclusions.companyId, companyId))

  const excludedEmails = new Set(exclusions.map((e) => e.recipientEmail.toLowerCase()))

  // 4. Find all overdue, unpaid, non-cancelled invoices
  const now = new Date()
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.status, 'issued'),
        eq(invoices.documentType, 'invoice'),
        eq(invoices.isCreditNote, false),
        isNull(invoices.paidAt),
        isNull(invoices.cancelsInvoiceId),
        lt(invoices.dueAt, now)
      )
    )

  console.log(`[Dunning] ${company.name}: ${overdueInvoices.length} overdue invoices found.`)

  for (const invoice of overdueInvoices) {
    stats.processed++

    try {
      // 4a. Skip if no recipient email
      if (!invoice.recipientEmail) {
        console.log(`[Dunning] Invoice ${invoice.invoiceNumber}: no recipient email. Skipping.`)
        stats.skipped++
        continue
      }

      // 4b. Skip if customer is excluded
      if (excludedEmails.has(invoice.recipientEmail.toLowerCase())) {
        console.log(`[Dunning] Invoice ${invoice.invoiceNumber}: ${invoice.recipientEmail} is excluded. Skipping.`)
        stats.skipped++
        continue
      }

      // 4c. Find which dunning stages have already been sent for this invoice
      const sentLogs = await db
        .select({ stage: dunningLogs.stage, sentAt: dunningLogs.sentAt })
        .from(dunningLogs)
        .where(
          and(
            eq(dunningLogs.invoiceId, invoice.id),
            eq(dunningLogs.companyId, companyId)
          )
        )
        .orderBy(desc(dunningLogs.sentAt))

      const sentStages = new Set(sentLogs.map((l) => l.stage))

      // 4d. Determine which stage to send next
      const dueAt = invoice.dueAt!
      const daysSinceDue = Math.floor((now.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24))

      let stageToSend: DunningStage | null = null
      let ruleToApply = null

      for (const stage of STAGE_ORDER) {
        if (sentStages.has(stage)) continue // already sent

        const rule = rules.find((r) => r.stage === stage)
        if (!rule) continue

        // Check if enough days have passed
        if (daysSinceDue >= rule.daysAfterDue) {
          stageToSend = stage
          ruleToApply = rule
          break // Only send the next pending stage, not all at once
        }
      }

      if (!stageToSend || !ruleToApply) {
        stats.skipped++
        continue
      }

      // 4e. Prepare email content
      const invoiceDate = format(invoice.createdAt, 'dd.MM.yyyy', { locale: de })
      const dueDate = format(dueAt, 'dd.MM.yyyy', { locale: de })
      const amount = formatAmount(invoice.totalAmount, invoice.currency)
      const feeAmount = ruleToApply.feeAmount ? formatAmount(ruleToApply.feeAmount) : undefined

      const vars = {
        recipientName: invoice.recipientName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate,
        dueDate,
        amount,
        companyName: company.name,
      }

      const subject = resolveTemplate(
        ruleToApply.subjectTemplate ||
          `${stageToSend === 'reminder' ? 'Zahlungserinnerung' : stageToSend === 'first' ? '1. Mahnung' : '2. Mahnung'}: Rechnung ${invoice.invoiceNumber}`,
        vars
      )

      const customBody = ruleToApply.bodyTemplate
        ? resolveTemplate(ruleToApply.bodyTemplate, vars)
        : undefined

      // Try to get PDF URL (non-fatal if unavailable)
      let pdfUrl: string | undefined
      try {
        if (invoice.pdfStorageKey) {
          pdfUrl = await getDocumentUrl(invoice.pdfStorageKey)
        }
      } catch {
        // PDF link is optional
      }

      // Render HTML email
      const html = await render(
        React.createElement(DunningEmail, {
          stage: stageToSend,
          recipientName: invoice.recipientName,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate,
          dueDate,
          amount,
          companyName: company.name,
          companyEmail: company.email || undefined,
          iban: company.iban || undefined,
          bic: company.bic || undefined,
          feeAmount,
          customBody,
          pdfUrl,
        })
      )

      // 4f. Send email
      let emailSent = false
      let emailError: string | undefined

      if (company.smtpSettings?.enabled && company.smtpSettings.host && company.smtpSettings.fromEmail) {
        // Use custom SMTP
        const nodemailer = await import('nodemailer')
        const secure = company.smtpSettings.encryption === 'ssl' || company.smtpSettings.port === 465

        const transporter = nodemailer.createTransport({
          host: company.smtpSettings.host,
          port: company.smtpSettings.port || 587,
          secure,
          auth: company.smtpSettings.username && company.smtpSettings.password
            ? { user: company.smtpSettings.username, pass: company.smtpSettings.password }
            : undefined,
          tls: { rejectUnauthorized: false },
        })

        const from = company.smtpSettings.fromName
          ? `"${company.smtpSettings.fromName}" <${company.smtpSettings.fromEmail}>`
          : company.smtpSettings.fromEmail

        try {
          await transporter.sendMail({
            from,
            to: invoice.recipientEmail,
            replyTo: company.email || undefined,
            subject,
            html,
          })
          emailSent = true
        } catch (err) {
          emailError = err instanceof Error ? err.message : String(err)
        }
      } else {
        // Use Resend
        const { data, error } = await resend.emails.send({
          from: 'TheOmniStack <noreply@theomnistack.de>',
          to: [invoice.recipientEmail],
          replyTo: company.email || undefined,
          subject,
          html,
        })

        if (error) {
          emailError = (error as any).message || JSON.stringify(error)
        } else {
          emailSent = true
        }
      }

      // 4g. Write dunning log
      await db.insert(dunningLogs).values({
        companyId,
        invoiceId: invoice.id,
        stage: stageToSend,
        status: emailSent ? 'sent' : 'failed',
        recipientEmail: invoice.recipientEmail,
        subject,
        errorMessage: emailError,
        triggeredByUserId: triggeredByUserId || null,
      })

      // 4h. Write invoice log (visible in detail panel)
      const stageLabel =
        stageToSend === 'reminder' ? 'Zahlungserinnerung' :
        stageToSend === 'first' ? '1. Mahnung' : '2. Mahnung'

      await db.insert(invoiceLogs).values({
        invoiceId: invoice.id,
        companyId,
        userId: triggeredByUserId || null,
        action: 'dunning',
        note: emailSent
          ? `${stageLabel} automatisch per E-Mail gesendet an ${invoice.recipientEmail}.`
          : `${stageLabel}: E-Mail-Versand fehlgeschlagen. Fehler: ${emailError}`,
      })

      if (emailSent) {
        stats.sent++
        console.log(`[Dunning] ✅ Sent ${stageToSend} for invoice ${invoice.invoiceNumber} to ${invoice.recipientEmail}`)
      } else {
        stats.failed++
        console.error(`[Dunning] ❌ Failed ${stageToSend} for invoice ${invoice.invoiceNumber}: ${emailError}`)
      }
    } catch (err) {
      stats.failed++
      console.error(`[Dunning] ❌ Error processing invoice ${invoice.invoiceNumber}:`, err)
    }
  }

  return stats
}

// ─── Worker ───────────────────────────────────────────────────────────────────
export function createDunningWorker() {
  return new Worker<DunningJobData>(
    QUEUE_DUNNING,
    async (job: Job<DunningJobData>) => {
      const { companyId, triggeredByUserId } = job.data
      console.log(`[Dunning Worker] Starting dunning check...`)

      let totalStats = { processed: 0, sent: 0, skipped: 0, failed: 0 }

      if (companyId) {
        // Single company (e.g. manual trigger)
        const stats = await processDunningForCompany(companyId, triggeredByUserId)
        totalStats = stats
      } else {
        // All companies
        const allCompanies = await db.select({ id: companies.id, name: companies.name }).from(companies)
        for (const company of allCompanies) {
          const stats = await processDunningForCompany(company.id, triggeredByUserId)
          totalStats.processed += stats.processed
          totalStats.sent += stats.sent
          totalStats.skipped += stats.skipped
          totalStats.failed += stats.failed
        }
      }

      console.log(
        `[Dunning Worker] Done. Processed: ${totalStats.processed}, Sent: ${totalStats.sent}, Skipped: ${totalStats.skipped}, Failed: ${totalStats.failed}`
      )
      return totalStats
    },
    {
      connection: redisConnection,
      concurrency: 1, // serial to avoid race conditions per company
    }
  )
}

// ─── Queue ────────────────────────────────────────────────────────────────────
export const dunningQueue = new Queue<DunningJobData>(QUEUE_DUNNING, {
  connection: redisConnection,
})

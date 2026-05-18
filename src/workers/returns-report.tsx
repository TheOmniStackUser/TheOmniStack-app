import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { db } from '@/db/client'
import { returnsLog, returnedItems, companies } from '@/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import { startOfDay, endOfDay, format } from 'date-fns'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReturnsReportDocument } from '@/components/pdf/returns-report'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { Resend } from 'resend'

// ─── Queue Name ──────────────────────────────────────────────────────────────
export const QUEUE_RETURNS_REPORT = 'returns-report'

export type ReturnsReportJobData = {
  companyId: string
  date?: string // YYYY-MM-DD, defaults to today
}

// ─── Redis & AWS Clients ─────────────────────────────────────────────────────
const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
redisConnection.on('error', (err) => {
  console.error('[Redis Error in returns-report]', err)
})

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // For MinIO
  forcePathStyle: !!process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'admin',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'password123',
  },
})

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

// ─── Worker ───────────────────────────────────────────────────────────────────
export function createReturnsReportWorker() {
  return new Worker<ReturnsReportJobData>(
    QUEUE_RETURNS_REPORT,
    async (job: Job<ReturnsReportJobData>) => {
      const { companyId } = job.data
      const reportDate = job.data.date ? new Date(job.data.date) : new Date()
      
      console.log(`[Returns Worker] Generating daily report for Company ${companyId} on ${format(reportDate, 'yyyy-MM-dd')}`)

      // 1. Fetch Company Data
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
      if (!company) throw new Error(`Company ${companyId} not found`)

      // 2. Fetch Returns for the Day
      const dayStart = startOfDay(reportDate)
      const dayEnd = endOfDay(reportDate)

      const dailyReturns = await db.query.returnsLog.findMany({
        where: and(
          eq(returnsLog.companyId, companyId),
          gte(returnsLog.scannedAt, dayStart),
          lte(returnsLog.scannedAt, dayEnd)
        ),
        with: {
          items: true
        }
      })

      if (dailyReturns.length === 0) {
        console.log(`[Returns Worker] No returns found for ${company.name} on this date. Skipping.`)
        return
      }

      // 3. Generate PDF Buffer
      // We cast to any to satisfy the complex renderToBuffer type requirements in a worker context
      const pdfBuffer = await renderToBuffer(
        <ReturnsReportDocument
          date={reportDate}
          companyName={company.name}
          returns={dailyReturns.map(r => ({
            orderNumber: r.orderNumber,
            customerName: r.customerName,
            scannedAt: r.scannedAt,
            items: r.items.map(i => ({
              skuOrProductName: i.skuOrProductName,
              quantity: i.quantity,
              condition: i.condition
            }))
          }))}
        /> as any
      )

      // 4. Upload to S3 (MinIO)
      const dateStr = format(reportDate, 'yyyy-MM-dd')
      const fileName = `reports/returns/${companyId}/returns_${dateStr}.pdf`
      
      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'omnistack-documents',
        Key: fileName,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }))

      // 5. Send Email via Resend
      if (company.email) {
        await resend.emails.send({
          from: 'TheOmniStack Reports <noreply@theomnistack.de>',
          to: [company.email],
          subject: `Daily Returns Summary - ${format(reportDate, 'dd.MM.yyyy')} - ${company.name}`,
          text: `Please find attached the daily returns report for ${company.name}.`,
          attachments: [
            {
              filename: `Returns_Report_${dateStr}.pdf`,
              content: pdfBuffer,
            }
          ]
        })
      }

      return { success: true, returnsCount: dailyReturns.length, s3Key: fileName }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  )
}

// ─── Queue for manual/cron triggering ────────────────────────────────────────
export const returnsReportQueue = new Queue<ReturnsReportJobData>(
  QUEUE_RETURNS_REPORT,
  { connection: redisConnection }
)

import { returnsReportQueue } from './returns-report'
import { db } from '@/db/client'
import { companies } from '@/db/schema'

/**
 * Sets up repeatable jobs (CRON) for all active companies.
 * This should be called once when the app starts or via a management CLI.
 */
export async function setupScheduledReports() {
  console.log('⏰ Setting up scheduled returns reports...')
  
  const allCompanies = await db.select({ id: companies.id, name: companies.name }).from(companies)
  
  for (const company of allCompanies) {
    const jobId = `daily-returns-${company.id}`
    
    // Schedule for 18:00 every day
    await returnsReportQueue.add(
      'daily-returns-report',
      { companyId: company.id },
      {
        jobId,
        repeat: {
          pattern: '0 18 * * *', // 18:00
        },
        removeOnComplete: true,
      }
    )
    console.log(`   - Scheduled 18:00 report for ${company.name}`)
  }
}

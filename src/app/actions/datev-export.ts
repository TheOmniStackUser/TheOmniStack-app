'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { eq, and, sql } from 'drizzle-orm'
import Papa from 'papaparse'

export async function generateDatevExportAction(year: number, month: number) {
  const auth = await requireAuth()

  const monthStr = month.toString().padStart(2, '0')
  const startDate = `${year}-${monthStr}-01T00:00:00.000Z`
  
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthYear = month === 12 ? year + 1 : year
  const nextMonthStr = nextMonth.toString().padStart(2, '0')
  const endDateTime = `${nextMonthYear}-${nextMonthStr}-01T00:00:00.000Z`

  const monthInvoices = await db.query.invoices.findMany({
    where: and(
      eq(invoices.companyId, auth.activeCompanyId),
      eq(invoices.status, 'issued'),
      sql`COALESCE(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startDate}`,
      sql`COALESCE(${invoices.issuedAt}, ${invoices.createdAt}) < ${endDateTime}`
    ),
    orderBy: (invoices, { asc }) => [asc(invoices.invoiceNumber)]
  })

  if (monthInvoices.length === 0) {
      return { success: false, message: 'Keine Rechnungen in diesem Monat gefunden.' }
  }

  const csvData = monthInvoices.map(inv => {
    const isCreditNote = inv.isCreditNote
    const amount = Number(inv.totalAmount).toFixed(2).replace('.', ',')
    const dateToUse = inv.issuedAt || inv.createdAt
    const belegdatum = new Date(dateToUse).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace(/\./g, '')
    
    const taxRateNum = Number(inv.taxRate)
    let erloeskonto = '8400'
    if (taxRateNum === 0.07) erloeskonto = '8300'
    if (taxRateNum === 0) erloeskonto = '8120' // Or 8200 depending on country

    const debitorenkonto = '10000'

    return {
      'Umsatz': amount,
      'Soll/Haben-Kennzeichen': isCreditNote ? 'S' : 'H',
      'WKZ Umsatz': inv.currency,
      'Konto': isCreditNote ? erloeskonto : debitorenkonto,
      'Gegenkonto': isCreditNote ? debitorenkonto : erloeskonto,
      'Belegdatum': belegdatum,
      'Belegfeld 1': inv.invoiceNumber,
      'Buchungstext': `${isCreditNote ? 'Gutschrift' : 'Rechnung'} ${inv.invoiceNumber} ${inv.recipientName}`,
    }
  })

  const csvString = Papa.unparse(csvData, { delimiter: ';' })

  return { success: true, csvString }
}

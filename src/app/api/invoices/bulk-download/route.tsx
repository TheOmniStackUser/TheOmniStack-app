import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { eq, and, inArray } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { downloadDocument } from '@/lib/storage'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const idsString = searchParams.get('ids')

    if (!idsString) {
      return new Response('Keine IDs übergeben', { status: 400 })
    }

    const ids = idsString.split(',').filter(id => id.length > 0)
    if (ids.length === 0) {
      return new Response('Keine gültigen IDs übergeben', { status: 400 })
    }

    // Fetch all invoices matching the IDs and company ID
    const invoicesData = await db
      .select()
      .from(invoices)
      .where(
        and(
          inArray(invoices.id, ids),
          eq(invoices.companyId, auth.activeCompanyId)
        )
      )

    if (invoicesData.length === 0) {
      return new Response('Keine Rechnungen gefunden', { status: 404 })
    }

    const invoicesMap = new Map(invoicesData.map(i => [i.id, i]))
    const sortedInvoices = ids.map(id => invoicesMap.get(id)).filter((i): i is typeof invoicesData[number] => !!i)

    // Collect all PDF buffers in the exact order of sortedInvoices
    const pdfBuffers: Buffer[] = []

    for (const invoice of sortedInvoices) {
      if (!invoice.pdfStorageKey) continue

      try {
        const buffer = await downloadDocument(invoice.pdfStorageKey)
        pdfBuffers.push(buffer)
      } catch (err) {
        console.error(`Fehler beim Herunterladen der Rechnung ${invoice.invoiceNumber}:`, err)
      }
    }

    if (pdfBuffers.length === 0) {
      return new Response('Keine PDF-Dokumente für die Rechnungen gefunden.', { status: 400 })
    }

    // Merge the PDFs using pdf-lib
    const mergedPdf = await PDFDocument.create()

    for (const buffer of pdfBuffers) {
      try {
        const srcPdf = await PDFDocument.load(buffer)
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
        copiedPages.forEach((page: any) => mergedPdf.addPage(page))
      } catch (err: any) {
        console.error('Fehler beim Zusammenführen eines Rechnungs-PDFs:', err)
        return new Response(`Fehler beim Zusammenführen der Rechnungs-PDFs: ${err.message}`, { status: 500 })
      }
    }

    const mergedPdfBytes = await mergedPdf.save()

    const today = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(today)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    const dateStr = `${year}-${month}-${day}`

    return new Response(new Uint8Array(mergedPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Rechnungen_Sammel_${dateStr}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating bulk invoices PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

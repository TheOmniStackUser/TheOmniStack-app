import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { eq, and, inArray } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'

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

    // Fetch orders matching the IDs and company ID
    const ordersData = await db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.id, ids),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    if (ordersData.length === 0) {
      return new Response('Keine Bestellungen gefunden', { status: 404 })
    }

    // Collect all label URLs and base64 payloads
    const pdfBuffers: Buffer[] = []

    for (const order of ordersData) {
      // Check both outbound and return labels
      const urls = [order.labelUrl, order.returnLabelUrl].filter((url): url is string => !!url)
      
      for (const url of urls) {
        try {
          if (url.startsWith('data:application/pdf;base64,')) {
            const base64 = url.split(',')[1]
            pdfBuffers.push(Buffer.from(base64, 'base64'))
          } else if (url.startsWith('http')) {
            const res = await fetch(url)
            if (!res.ok) {
              throw new Error(`Failed to fetch label from ${url}: HTTP ${res.status}`)
            }
            const arrayBuffer = await res.arrayBuffer()
            pdfBuffers.push(Buffer.from(arrayBuffer))
          } else {
            // Assume raw base64 string
            pdfBuffers.push(Buffer.from(url, 'base64'))
          }
        } catch (err) {
          console.error(`Fehler beim Laden des Labels von "${url}":`, err)
        }
      }
    }

    if (pdfBuffers.length === 0) {
      return new Response('Keine gedruckten Labels bei den ausgewählten Bestellungen vorhanden.', { status: 400 })
    }

    // Merge the PDFs using pdf-lib
    const mergedPdf = await PDFDocument.create()

    for (const buffer of pdfBuffers) {
      try {
        const srcPdf = await PDFDocument.load(buffer)
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
        copiedPages.forEach((page: any) => mergedPdf.addPage(page))
      } catch (err) {
        console.error('Fehler beim Zusammenführen eines PDFs:', err)
      }
    }

    const mergedPdfBytes = await mergedPdf.save()
    const pdfBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' })

    return new Response(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Versandlabels_Sammel.pdf"',
      },
    })
  } catch (error: any) {
    console.error('Error generating bulk shipping labels PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

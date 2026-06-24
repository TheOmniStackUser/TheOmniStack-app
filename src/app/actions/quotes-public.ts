'use server'

import { db } from '@/db/client'
import { invoices, invoiceLogs } from '@/db/schema/invoices'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDocumentUrl } from '@/lib/storage'

export async function getPublicQuoteAction(quoteId: string) {
  const quote = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, quoteId),
      eq(invoices.documentType, 'quote')
    ),
    with: {
      company: {
        columns: {
          name: true,
          legalName: true,
          email: true,
          phone: true,
          website: true,
          logoUrl: true
        }
      },
      items: true
    }
  })

  if (!quote) return null

  let pdfUrl = null
  if (quote.pdfStorageKey) {
    pdfUrl = await getDocumentUrl(quote.pdfStorageKey)
  }

  return { quote, pdfUrl }
}

export async function respondToQuoteAction(quoteId: string, action: 'accept' | 'reject') {
  const quote = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, quoteId),
      eq(invoices.documentType, 'quote')
    )
  })

  if (!quote) throw new Error('Angebot nicht gefunden')
  if (quote.quoteAcceptedAt || quote.quoteRejectedAt) {
    throw new Error('Dieses Angebot wurde bereits beantwortet.')
  }

  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.update(invoices)
      .set({
        quoteAcceptedAt: action === 'accept' ? now : null,
        quoteRejectedAt: action === 'reject' ? now : null
      })
      .where(eq(invoices.id, quoteId))

    await tx.insert(invoiceLogs).values({
      invoiceId: quoteId,
      companyId: quote.companyId,
      action: action === 'accept' ? 'accepted' : 'rejected',
      note: action === 'accept' 
        ? 'Der Kunde hat das Angebot über den Link digital angenommen.' 
        : 'Der Kunde hat das Angebot über den Link digital abgelehnt.'
    })
  })

  revalidatePath(`/q/${quoteId}`)
  return { success: true }
}

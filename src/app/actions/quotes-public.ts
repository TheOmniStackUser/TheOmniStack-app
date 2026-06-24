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

export async function respondToQuoteAction(quoteId: string, action: 'accept' | 'reject', reason?: string) {
  const quote = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, quoteId),
      eq(invoices.documentType, 'quote')
    ),
    with: {
      company: {
        columns: {
          email: true,
          name: true
        }
      }
    }
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
        quoteRejectedAt: action === 'reject' ? now : null,
        quoteRejectedReason: action === 'reject' && reason ? reason : null
      })
      .where(eq(invoices.id, quoteId))

    await tx.insert(invoiceLogs).values({
      invoiceId: quoteId,
      companyId: quote.companyId,
      action: action === 'accept' ? 'accepted' : 'rejected',
      note: action === 'accept' 
        ? 'Der Kunde hat das Angebot über den Link digital angenommen.' 
        : `Der Kunde hat das Angebot über den Link digital abgelehnt.${reason ? `\n\nBegründung des Kunden:\n"${reason}"` : ''}`
    })
  })

  // Send email to company if rejected
  if (action === 'reject' && quote.company?.email) {
    try {
      const { sendInvoiceEmail } = await import('@/lib/email')
      const emailHtml = `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2 style="color: #dc2626;">Angebot abgelehnt</h2>
          <p>Ein Kunde hat soeben das Angebot <strong>${quote.invoiceNumber || quote.draftName}</strong> digital abgelehnt.</p>
          ${reason ? `<p><strong>Vom Kunden angegebene Begründung:</strong><br/><em>"${reason}"</em></p>` : ''}
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.theomnistack.de'}/quotes">Zum Angebot im Dashboard</a></p>
        </div>
      `
      await sendInvoiceEmail({
        toEmail: quote.company.email,
        replyTo: 'noreply@theomnistack.de',
        subject: `Angebot abgelehnt: ${quote.invoiceNumber || quote.draftName}`,
        html: emailHtml,
      })
    } catch (error) {
      console.error('Fehler beim Senden der Ablehnungs-E-Mail:', error)
    }
  }

  revalidatePath(`/q/${quoteId}`)
  return { success: true }
}

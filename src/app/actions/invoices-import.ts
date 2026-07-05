'use server'

import { parseEInvoiceXml, ParsedInvoiceData } from '@/lib/e-invoice-parser'
import { db } from '@/db/client'
import { incomingInvoices } from '@/db/schema/incoming-invoices'
import { invoices } from '@/db/schema/invoices'
import { getCurrentUser } from '@/lib/session'

export async function parseUploadedInvoice(formData: FormData): Promise<{ success: boolean; data?: ParsedInvoiceData; error?: string }> {

  try {
    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'Keine Datei hochgeladen.' }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let xmlString = ''

    if (file.type === 'application/xml' || file.name.endsWith('.xml')) {
      xmlString = buffer.toString('utf-8')
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // Very basic extraction attempt for ZUGFeRD PDF.
      // A robust solution in production requires a full PDF parser that handles /FlateDecode streams.
      // We attempt to find the XML string directly in case it's uncompressed, or we throw an error.
      const pdfString = buffer.toString('utf-8')
      const startIdx = pdfString.indexOf('<?xml')
      let endIdx = pdfString.lastIndexOf('</rsm:CrossIndustryInvoice>')
      if (endIdx === -1) {
        endIdx = pdfString.lastIndexOf('</Invoice>') // UBL
      }

      if (startIdx !== -1 && endIdx !== -1) {
        // Find the actual end tag
        const endTagLength = pdfString.substring(endIdx, endIdx + 30).indexOf('>') + 1
        xmlString = pdfString.substring(startIdx, endIdx + endTagLength)
      } else {
        return { success: false, error: 'Konnte keine eingebettete ZUGFeRD XML-Datei in diesem PDF finden. Bitte laden Sie die .xml Datei direkt hoch.' }
      }
    } else {
      return { success: false, error: 'Nicht unterstütztes Dateiformat. Bitte laden Sie eine .xml oder .pdf Datei hoch.' }
    }

    const parsedData = parseEInvoiceXml(xmlString)
    return { success: true, data: parsedData }
  } catch (error: any) {
    console.error('Error parsing invoice:', error)
    return { success: false, error: error.message || 'Fehler beim Parsen der E-Rechnung.' }
  }
}

export async function importEInvoice(data: ParsedInvoiceData & { importAs: 'incoming' | 'outgoing' }) {
  const user = await getCurrentUser()
  if (!user || !user.companyId) {
    return { success: false, error: 'Nicht autorisiert.' }
  }
  
  if (data.importAs === 'incoming') {
    await db.insert(incomingInvoices).values({
      companyId: user.companyId,
      supplierName: data.supplierName,
      supplierVatId: data.supplierVatId,
      supplierEmail: data.supplierEmail,
      supplierIban: data.supplierIban,
      supplierBic: data.supplierBic,
      invoiceNumber: data.invoiceNumber,
      currency: data.currency,
      subtotalAmount: data.subtotalAmount.toString(),
      taxAmount: data.taxAmount.toString(),
      totalAmount: data.totalAmount.toString(),
      issuedAt: data.issueDate ? new Date(data.issueDate) : null,
      importedBy: user.id,
      status: 'pending_payment',
    })
  } else {
    // Import as outgoing invoice
    await db.insert(invoices).values({
      companyId: user.companyId,
      invoiceNumber: data.invoiceNumber,
      recipientName: data.supplierName, // The buyer in an outgoing invoice
      recipientEmail: data.supplierEmail,
      currency: data.currency,
      subtotalAmount: data.subtotalAmount.toString(),
      taxAmount: data.taxAmount.toString(),
      totalAmount: data.totalAmount.toString(),
      issuedAt: data.issueDate ? new Date(data.issueDate) : null,
      status: 'issued',
    })
  }

  return { success: true }
}

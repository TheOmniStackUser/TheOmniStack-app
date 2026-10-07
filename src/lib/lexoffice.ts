import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { invoices, invoiceItems, Invoice, InvoiceItem } from '@/db/schema/invoices'
import { eq } from 'drizzle-orm'
import { getDocumentUrl } from '@/lib/storage'

const LEXOFFICE_API_URL = 'https://api.lexoffice.io/v1'

export interface LexofficeVoucherResponse {
  id: string;
  organizationId: string;
  createdDate: string;
  updatedDate: string;
  version: number;
}

export async function exportInvoiceToLexoffice(invoiceId: string, companyId: string) {
  // 1. Fetch the company to get the API key
  const companyRecord = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  })

  if (!companyRecord) {
    throw new Error(`Company not found: ${companyId}`)
  }

  const apiKey = companyRecord.lexofficeApiKey
  if (!apiKey) {
    throw new Error(`Lexoffice API key not configured for company: ${companyId}`)
  }

  // 2. Fetch the invoice and items
  const invoiceRecord = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: {
      items: true,
    },
  })

  if (!invoiceRecord) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  if (!invoiceRecord.pdfStorageKey) {
    throw new Error(`Invoice does not have a PDF generated: ${invoiceId}`)
  }

  // 3. Create Voucher Data
  const taxRatePercent = parseFloat(invoiceRecord.taxRate) * 100

  const voucherData: any = {
    type: 'salesinvoice',
    voucherNumber: invoiceRecord.invoiceNumber,
    voucherDate: (invoiceRecord.issuedAt || new Date()).toISOString().split('T')[0],
    totalGrossAmount: parseFloat(invoiceRecord.totalAmount),
    totalTaxAmount: parseFloat(invoiceRecord.taxAmount),
    taxType: 'gross',
    useCollectiveContact: true,
    remark: `Exported from TheOmniStack - ${invoiceRecord.invoiceNumber}`,
    voucherItems: [
      {
        amount: parseFloat(invoiceRecord.totalAmount),
        taxAmount: parseFloat(invoiceRecord.taxAmount),
        taxRatePercent: Math.round(taxRatePercent),
      }
    ]
  }

  // 4. Create Voucher
  const voucherRes = await fetch(`${LEXOFFICE_API_URL}/vouchers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(voucherData),
  })

  if (!voucherRes.ok) {
    const errorText = await voucherRes.text()
    throw new Error(`Failed to create Lexoffice voucher: ${voucherRes.statusText} - ${errorText}`)
  }

  const voucher: LexofficeVoucherResponse = await voucherRes.json()

  // 5. Download PDF from Storage and Upload to Lexoffice
  const pdfUrl = await getDocumentUrl(invoiceRecord.pdfStorageKey)
  const pdfRes = await fetch(pdfUrl)
  
  if (!pdfRes.ok) {
    throw new Error(`Failed to download PDF for invoice: ${invoiceId}`)
  }

  const pdfBuffer = await pdfRes.arrayBuffer()
  
  // Lexoffice requires multipart/form-data for file upload
  const formData = new FormData()
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
  formData.append('file', blob, `${invoiceRecord.invoiceNumber}.pdf`)

  const uploadRes = await fetch(`${LEXOFFICE_API_URL}/vouchers/${voucher.id}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
    body: formData,
  })

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text()
    throw new Error(`Failed to upload PDF to Lexoffice voucher ${voucher.id}: ${uploadRes.statusText} - ${errorText}`)
  }

  return voucher
}

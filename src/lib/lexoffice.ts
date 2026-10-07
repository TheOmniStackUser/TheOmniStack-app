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

export async function getValidLexofficeToken(companyRecord: Company) {
  let accessToken = companyRecord.lexofficeApiKey
  
  if (!accessToken) {
    throw new Error(`Lexoffice not configured for company: ${companyRecord.id}`)
  }

  // Check if token is expired (or expires in the next 5 minutes)
  const isOAuth = !!companyRecord.lexofficeRefreshToken
  const expiresAt = companyRecord.lexofficeExpiresAt
  
  if (isOAuth && expiresAt && expiresAt.getTime() - 5 * 60000 < Date.now()) {
    // Need to refresh
    const clientId = process.env.LEXOFFICE_CLIENT_ID
    const clientSecret = process.env.LEXOFFICE_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      throw new Error('LEXOFFICE_CLIENT_ID or LEXOFFICE_CLIENT_SECRET not configured')
    }

    const tokenParams = new URLSearchParams()
    tokenParams.append('grant_type', 'refresh_token')
    tokenParams.append('refresh_token', companyRecord.lexofficeRefreshToken!)
    
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenRes = await fetch('https://app.lexoffice.de/auth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json'
      },
      body: tokenParams.toString()
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Failed to refresh Lexoffice token: ${err}`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData
    const newExpiresAt = new Date(Date.now() + (expires_in * 1000))

    await db.update(companies).set({
      lexofficeApiKey: access_token,
      lexofficeRefreshToken: refresh_token,
      lexofficeExpiresAt: newExpiresAt,
      updatedAt: new Date()
    }).where(eq(companies.id, companyRecord.id))

    accessToken = access_token
  }

  return accessToken
}

export async function exportInvoiceToLexoffice(invoiceId: string, companyId: string) {
  // 1. Fetch the company
  const companyRecord = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  })

  if (!companyRecord) {
    throw new Error(`Company not found: ${companyId}`)
  }

  const apiKey = await getValidLexofficeToken(companyRecord)

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

import { NextRequest, NextResponse } from 'next/server'
import { exportInvoiceToLexoffice } from '@/lib/lexoffice'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { invoiceId } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    const voucher = await exportInvoiceToLexoffice(invoiceId, session.activeCompanyId)

    return NextResponse.json({ success: true, voucher })
  } catch (error: any) {
    console.error('Error exporting to Lexoffice:', error)
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}

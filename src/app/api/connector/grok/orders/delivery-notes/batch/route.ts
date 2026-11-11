import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { getMergedDeliveryNotesPdf } from '@/lib/grok-connector/delivery-notes'

export const dynamic = 'force-dynamic'

async function handleBatchDeliveryNotes(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const url = new URL(req.url)
  let orderIds: string[] = []

  // Check query params (?ids=id1,id2)
  const idsParam = url.searchParams.get('ids') || url.searchParams.get('orderIds')
  if (idsParam) {
    orderIds = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  }

  // Check JSON body if POST and not yet found
  if (req.method === 'POST') {
    try {
      const body = await req.json().catch(() => ({}))
      if (Array.isArray(body?.orderIds)) {
        orderIds = body.orderIds.map((id: any) => String(id).trim()).filter(Boolean)
      } else if (Array.isArray(body?.ids)) {
        orderIds = body.ids.map((id: any) => String(id).trim()).filter(Boolean)
      }
    } catch {
      // Body parsing ignored if empty or query params used
    }
  }

  if (orderIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No order IDs provided. Please provide an array of orderIds in the request body or via ?ids=id1,id2.',
      },
      { status: 400 }
    )
  }

  try {
    const result = await getMergedDeliveryNotesPdf(orderIds, authResult.auth.companyId)
    const wantsPdf =
      url.searchParams.get('format') === 'pdf' ||
      url.searchParams.get('download') === 'true' ||
      req.headers.get('accept')?.includes('application/pdf')

    if (wantsPdf) {
      return new Response(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${result.filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    const pdfBase64 = result.pdfBuffer.toString('base64')
    const downloadUrl = `/api/connector/grok/orders/delivery-notes/batch?ids=${encodeURIComponent(orderIds.join(','))}&format=pdf`

    return NextResponse.json({
      success: true,
      data: {
        filename: result.filename,
        processedCount: result.processedCount,
        totalCount: result.totalCount,
        downloadUrl,
        pdfBase64,
        pdfUrl: `data:application/pdf;base64,${pdfBase64}`,
      },
    })
  } catch (err: any) {
    console.error('[Connector Bulk DeliveryNotes] Error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate bulk delivery notes.' },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  return handleBatchDeliveryNotes(req)
}

export async function POST(req: Request) {
  return handleBatchDeliveryNotes(req)
}

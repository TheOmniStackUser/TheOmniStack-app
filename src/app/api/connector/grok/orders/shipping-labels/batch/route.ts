import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { getMergedShippingLabelsPdf } from '@/lib/grok-connector/delivery-notes'

export const dynamic = 'force-dynamic'

async function handleBatchShippingLabels(req: Request) {
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

  let body: any = {}
  // Check JSON body if POST and not yet found
  if (req.method === 'POST') {
    try {
      body = await req.json().catch(() => ({}))
      if (Array.isArray(body?.orderIds)) {
        orderIds = body.orderIds.map((id: any) => String(id).trim()).filter(Boolean)
      } else if (Array.isArray(body?.ids)) {
        orderIds = body.ids.map((id: any) => String(id).trim()).filter(Boolean)
      }
    } catch {
      // Body parsing ignored if empty or query params used
    }
  }

  const carrier = body.carrier || url.searchParams.get('carrier') || undefined
  const parcelClass = body.parcelClass || body.parcel_class || url.searchParams.get('parcelClass') || url.searchParams.get('parcel_class') || undefined
  const weightKg = body.weightKg ?? body.weight_kg ?? (url.searchParams.get('weightKg') ? Number(url.searchParams.get('weightKg')) : undefined)
  const replaceExisting = body.replaceExisting ?? body.replace_existing ?? (url.searchParams.get('replaceExisting') === 'true')

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
    const { executeTool } = await import('@/lib/grok-connector/tools')
    const toolResult = await executeTool(
      'generate_bulk_shipping_labels',
      {
        orderIds,
        carrier,
        parcelClass,
        weightKg,
        replaceExisting,
      },
      authResult.auth
    )

    if (!toolResult.success) {
      return NextResponse.json(toolResult, { status: 400 })
    }

    const resultData = toolResult.data
    const wantsPdf =
      url.searchParams.get('format') === 'pdf' ||
      url.searchParams.get('download') === 'true' ||
      req.headers.get('accept')?.includes('application/pdf')

    if (wantsPdf) {
      const pdfBuffer = Buffer.from(resultData.pdfBase64, 'base64')
      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${resultData.filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: resultData,
    })
  } catch (err: any) {
    console.error('[Connector Bulk ShippingLabels] Error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate bulk shipping labels.' },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  return handleBatchShippingLabels(req)
}

export async function POST(req: Request) {
  return handleBatchShippingLabels(req)
}

import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('productId') || undefined
  const marketplace = searchParams.get('marketplace') || undefined
  const query = searchParams.get('query') || undefined
  const limit = searchParams.has('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined
  const offset = searchParams.has('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined

  const result = await executeTool(
    'list_product_mappings',
    { productId, marketplace, query, limit, offset },
    authResult.auth
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

export async function POST(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const result = await executeTool(
    'set_product_mapping',
    {
      productId: body.productId,
      marketplace: body.marketplace,
      marketplaceSku: body.marketplaceSku,
      marketplaceProductId: body.marketplaceProductId,
      integrationId: body.integrationId,
      ean: body.ean,
      syncStock: body.syncStock,
      syncPrice: body.syncPrice,
      priceModifierType: body.priceModifierType,
      priceModifierValue: body.priceModifierValue,
    },
    authResult.auth
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

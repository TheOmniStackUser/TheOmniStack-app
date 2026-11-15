import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { searchParams } = new URL(req.url)
  const params: Record<string, any> = {}
  if (searchParams.has('productId')) params.productId = searchParams.get('productId')
  if (searchParams.has('sku')) params.sku = searchParams.get('sku')
  if (searchParams.has('identifier')) params.identifier = searchParams.get('identifier')
  if (searchParams.has('marketplace')) params.marketplace = searchParams.get('marketplace')
  if (searchParams.has('integrationId')) params.integrationId = searchParams.get('integrationId')

  const result = await executeTool('get_price_rules', params, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

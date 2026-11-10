import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { searchParams } = new URL(req.url)
  const params: Record<string, any> = {}

  if (searchParams.has('status')) params.status = searchParams.get('status')
  if (searchParams.has('marketplace')) params.marketplace = searchParams.get('marketplace')
  if (searchParams.has('query')) params.query = searchParams.get('query')
  if (searchParams.has('fromDate')) params.fromDate = searchParams.get('fromDate')
  if (searchParams.has('toDate')) params.toDate = searchParams.get('toDate')
  if (searchParams.has('limit')) params.limit = parseInt(searchParams.get('limit') || '25', 10)
  if (searchParams.has('offset')) params.offset = parseInt(searchParams.get('offset') || '0', 10)

  const result = await executeTool('list_orders', params, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

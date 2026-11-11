import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { searchParams } = new URL(req.url)
  const marketplace = searchParams.get('marketplace') || undefined
  const query = searchParams.get('query') || undefined
  const isBlocked = searchParams.has('isBlocked') ? searchParams.get('isBlocked') === 'true' : undefined
  const limit = searchParams.has('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined
  const offset = searchParams.has('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined

  const result = await executeTool(
    'list_unmapped_listings',
    { marketplace, query, isBlocked, limit, offset },
    authResult.auth
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

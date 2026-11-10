import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const result = await executeTool('get_analytics_summary', {}, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

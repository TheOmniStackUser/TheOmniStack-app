import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const result = await executeTool('trigger_marketplace_sync', body, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

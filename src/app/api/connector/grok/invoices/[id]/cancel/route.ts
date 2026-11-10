import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { id } = await props.params
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const result = await executeTool(
    'cancel_invoice',
    { invoiceId: id, reason: body.reason },
    authResult.auth
  )
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

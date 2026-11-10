import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { id } = await props.params
  const result = await executeTool('get_product_details', { identifier: id }, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

export async function PATCH(
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

  const result = await executeTool('update_product', { productId: id, ...body }, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

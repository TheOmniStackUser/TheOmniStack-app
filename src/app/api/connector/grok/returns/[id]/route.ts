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
  const result = await executeTool('get_return_details', { returnId: id }, authResult.auth)
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
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: 'Invalid JSON request body: object expected.' }, { status: 400 })
  }

  if (body.returnId !== undefined && body.returnId !== id) {
    return NextResponse.json(
      { success: false, error: `Body returnId '${body.returnId}' does not match path parameter id '${id}'.` },
      { status: 400 }
    )
  }

  const result = await executeTool('update_return', { ...body, returnId: id }, authResult.auth)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

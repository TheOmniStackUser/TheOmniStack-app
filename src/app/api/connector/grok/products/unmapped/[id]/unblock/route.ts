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

  const result = await executeTool(
    'unblock_unmapped_listing',
    {
      unmappedId: id,
    },
    authResult.auth
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

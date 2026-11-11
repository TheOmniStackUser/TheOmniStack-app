import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { id } = await props.params
  const { searchParams } = new URL(req.url)
  const restoreToUnmapped = searchParams.has('restoreToUnmapped')
    ? searchParams.get('restoreToUnmapped') === 'true'
    : true

  const result = await executeTool(
    'delete_product_mapping',
    {
      mappingId: id,
      restoreToUnmapped,
    },
    authResult.auth
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}

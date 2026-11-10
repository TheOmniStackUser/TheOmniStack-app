import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    },
  })
}

export async function POST(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) {
    return authResult.response
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request body' },
      { status: 400 }
    )
  }

  const toolName = body.tool || body.name || body.action
  if (!toolName || typeof toolName !== 'string') {
    return NextResponse.json(
      {
        success: false,
        error: "Missing required 'tool' string parameter in request body.",
      },
      { status: 400 }
    )
  }

  const parameters = body.parameters || body.params || body.arguments || {}

  const result = await executeTool(toolName, parameters, authResult.auth)

  const status = result.success ? 200 : 400
  return NextResponse.json(result, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

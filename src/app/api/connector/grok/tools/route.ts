import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { TOOLS_MANIFEST } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) {
    return authResult.response
  }

  // Format into OpenAI / Grok function-calling tool format
  const formattedTools = TOOLS_MANIFEST.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  return NextResponse.json({
    tools: formattedTools,
    rawManifest: TOOLS_MANIFEST,
  })
}

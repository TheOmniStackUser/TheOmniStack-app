import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { TOOLS_MANIFEST, executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    },
  })
}

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) {
    return authResult.response
  }

  return NextResponse.json({
    status: 'ready',
    protocol: 'mcp',
    version: '2024-11-05',
    serverInfo: {
      name: 'TheOmniStack-Grok-MCP-Server',
      version: '1.0.0',
    },
    toolsCount: TOOLS_MANIFEST.length,
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
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    )
  }

  const { jsonrpc = '2.0', id, method, params = {} } = body

  try {
    switch (method) {
      case 'initialize': {
        return NextResponse.json({
          jsonrpc,
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'TheOmniStack-Grok-Connector',
              version: '1.0.0',
            },
          },
        })
      }

      case 'notifications/initialized': {
        return NextResponse.json({ jsonrpc, id, result: {} })
      }

      case 'ping': {
        return NextResponse.json({ jsonrpc, id, result: {} })
      }

      case 'tools/list': {
        const tools = TOOLS_MANIFEST.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        }))
        return NextResponse.json({
          jsonrpc,
          id,
          result: { tools },
        })
      }

      case 'tools/call': {
        const { name, arguments: toolArgs = {} } = params
        if (!name) {
          return NextResponse.json({
            jsonrpc,
            id,
            error: { code: -32602, message: "Missing tool 'name' in parameters" },
          })
        }

        const execution = await executeTool(name, toolArgs, authResult.auth)
        const isError = !execution.success

        return NextResponse.json({
          jsonrpc,
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(execution, null, 2),
              },
            ],
            isError,
          },
        })
      }

      default:
        return NextResponse.json({
          jsonrpc,
          id,
          error: { code: -32601, message: `Method '${method}' not found` },
        })
    }
  } catch (err: any) {
    return NextResponse.json({
      jsonrpc,
      id,
      error: { code: -32603, message: err.message || 'Internal JSON-RPC error' },
    })
  }
}

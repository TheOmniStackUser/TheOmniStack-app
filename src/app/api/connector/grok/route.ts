import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { TOOLS_MANIFEST } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) {
    return authResult.response
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`

  return NextResponse.json({
    name: 'TheOmniStack Grok Bot Connector',
    version: '1.0.0',
    status: 'ready',
    authenticatedAs: {
      companyId: authResult.auth.companyId,
      companyName: authResult.auth.companyName,
      role: authResult.auth.role,
    },
    protocols: {
      openApiJson: `${baseUrl}/api/connector/grok/openapi.json`,
      openApiYaml: `${baseUrl}/api/connector/grok/openapi.yaml`,
      mcpEndpoint: `${baseUrl}/api/connector/grok/mcp`,
      universalExecutor: `${baseUrl}/api/connector/grok/execute`,
      toolsCatalog: `${baseUrl}/api/connector/grok/tools`,
    },
    toolsCount: TOOLS_MANIFEST.length,
    capabilities: [
      'Orders Search & Management',
      'GoBD Invoice Generation & Cancellation',
      'Delivery Notes Issuance',
      'Carrier Shipping Labels (DHL, Hermes, DPD)',
      'Returns Management & Condition Inspection',
      'Marketplace Order & Inventory Synchronization',
      'Central Warehouse Stock Adjustment (Wawi)',
      'Customer Directory Management',
      'Live Revenue & Operational Analytics',
    ],
  })
}

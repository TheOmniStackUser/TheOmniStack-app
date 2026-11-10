import { NextResponse } from 'next/server'
import { getOpenApiSpec } from '@/lib/grok-connector/openapi-spec'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const spec = getOpenApiSpec(baseUrl)

  return NextResponse.json(spec, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

import { NextResponse } from 'next/server'
import { getOpenApiSpec, jsonToYaml } from '@/lib/grok-connector/openapi-spec'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const spec = getOpenApiSpec(baseUrl)
  const yamlContent = jsonToYaml(spec)

  return new NextResponse(yamlContent, {
    headers: {
      'Content-Type': 'application/x-yaml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

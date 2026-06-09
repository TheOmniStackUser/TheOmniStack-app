import { NextRequest, NextResponse } from 'next/server'

/**
 * Debug endpoint – logs ALL query parameters OTTO sends to our callback.
 * Visit: https://app.theomnistack.de/api/auth/callback/otto/debug
 * Or check Vercel logs after an OTTO connection attempt.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })

  const cookies: Record<string, string> = {}
  request.cookies.getAll().forEach(c => {
    cookies[c.name] = c.value.substring(0, 40) + '...'
  })

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  console.log('[Otto Debug] Query params received:', JSON.stringify(params))
  console.log('[Otto Debug] Cookies:', JSON.stringify(cookies))

  return NextResponse.json({
    message: 'Otto OAuth Debug Endpoint',
    timestamp: new Date().toISOString(),
    queryParams: params,
    cookies,
    hasCode: !!params.code,
    hasState: !!params.state,
    hasIss: !!params.iss,
    hasCookieCompanyId: !!cookies['otto_oauth_company_id'],
  }, { status: 200 })
}

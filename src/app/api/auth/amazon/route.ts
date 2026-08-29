import { NextRequest, NextResponse } from 'next/server'

// The URL where Amazon Seller Central asks the user for consent
const AMAZON_OAUTH_URL = 'https://sellercentral-europe.amazon.com/apps/authorize/consent'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const action = searchParams.get('action')
  const companyId = searchParams.get('companyId')

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  }

  if (action === 'connect') {
    const applicationId = process.env.AMAZON_APPLICATION_ID || 'amzn1.sp.solution.90e0a7a9-6103-4d97-adec-5f65704e4108'
    
    // We pass the companyId in the 'state' parameter so Amazon gives it back to us in the callback
    const authUrl = new URL(AMAZON_OAUTH_URL)
    authUrl.searchParams.set('application_id', applicationId)
    authUrl.searchParams.set('state', companyId)
    authUrl.searchParams.set('version', 'beta')

    return NextResponse.redirect(authUrl.toString())
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

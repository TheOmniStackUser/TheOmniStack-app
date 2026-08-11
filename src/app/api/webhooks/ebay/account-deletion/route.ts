import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// The verification token that eBay will use to verify this endpoint
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN || 'OMNISTACK_EBAY_TOKEN_2026_FOR_ACCOUNT_DELETION_MAD'

/**
 * GET handler for eBay Endpoint Verification Challenge
 */
export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get('challenge_code')

  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  // The endpoint URL must match EXACTLY what is configured in the eBay portal
  // Let's reconstruct the current URL from the request.
  // Note: Depending on your proxy setup (e.g. Vercel), req.url gives the full URL.
  // We remove the query parameters to get the exact base endpoint URL.
  const endpoint = req.url.split('?')[0]

  try {
    const hash = crypto.createHash('sha256')
    hash.update(challengeCode + EBAY_VERIFICATION_TOKEN + endpoint)
    const challengeResponse = hash.digest('hex')

    return NextResponse.json({
      challengeResponse
    })
  } catch (error) {
    console.error('[eBay Webhook] Error generating challenge response:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST handler for actual Account Deletion Notifications
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[eBay Webhook] Received Account Deletion Notification:', body)
    
    // Here we would typically process the deletion request (e.g., anonymize user data)
    // For now, eBay just expects a 200 OK response to acknowledge receipt.

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[eBay Webhook] Error processing POST request:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { HermesAdapter } from '@/adapters/shipping/hermes'

export const dynamic = 'force-dynamic'

// POST: Test whether the saved Hermes credentials are valid
export async function POST() {
  try {
    const auth = await requireAuth()
    
    // This will throw a clear error if no credentials are configured
    const adapter = await HermesAdapter.initialize(auth.activeCompanyId)
    
    // Accessing the private getAccessToken method indirectly by calling a public method
    // We expose a testAuth method for this purpose
    const token = await adapter.testAuth()

    return NextResponse.json({ success: true, token: token.slice(0, 20) + '...' })
  } catch (error: any) {
    console.error('[Hermes Auth Test Error]', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}

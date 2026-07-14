import { NextResponse } from 'next/server'
import { triggerGlobalMarketplaceSync } from '@/app/actions/products'

export const maxDuration = 300 // 5 minutes

export async function POST() {
  try {
    const result = await triggerGlobalMarketplaceSync()
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[GlobalSync] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}

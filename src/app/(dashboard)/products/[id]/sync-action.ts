'use server'

import { requireAuth } from '@/lib/session'

export async function triggerProductSync(productId: string, sku: string, currentStock: number, price: number) {
  const auth = await requireAuth()
  
  const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
  
  // Await the push so the UI can wait for it and show loading state
  await pushUpdatesToMarketplaces(auth.activeCompanyId, [{
    sku,
    stock: Math.max(0, currentStock || 0),
    price: price || 0
  }])
  
  return { success: true }
}

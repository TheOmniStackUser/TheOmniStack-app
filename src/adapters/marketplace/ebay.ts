import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type EbayAdapterConfig = {
  clientId: string
  clientSecret: string
  environment?: 'sandbox' | 'production'
}

export class EbayAdapter implements MarketplaceAdapter {
  readonly marketplace = 'ebay' as const
  private readonly baseUrl: string

  constructor(private readonly config: EbayAdapterConfig) {
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'
  }

  /**
   * Fetches all unshipped orders from eBay Fulfillment API.
   * Stubbed for initial connection structure.
   */
  async fetchUnshippedOrders(companyId: string, _options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    console.log(`[EbayAdapter] Fetching open orders for company ${companyId}...`)
    return []
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[EbayAdapter] Simulating refund for order ${marketplaceOrderId}:`, refundItems)
    return true
  }

  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    console.log(`[EbayAdapter] Fetching products for company ${companyId}... (Stubbed)`)
    return []
  }

  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    console.log(`[EbayAdapter] Simulating update listings for company ${companyId}:`, updates)
  }
}

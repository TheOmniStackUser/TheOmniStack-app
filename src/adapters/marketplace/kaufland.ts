import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type KauflandAdapterConfig = {
  clientId: string
  clientSecret: string
  environment?: 'sandbox' | 'production'
}

export class KauflandAdapter implements MarketplaceAdapter {
  readonly marketplace = 'kaufland' as const
  private readonly baseUrl: string

  constructor(private readonly config: KauflandAdapterConfig) {
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://seller-api.kaufland.de/v2'
      : 'https://seller-api.kaufland.de/v2'
  }

  /**
   * Fetches all unshipped orders from Kaufland Seller API.
   * Stubbed for initial connection structure.
   */
  async fetchUnshippedOrders(companyId: string, _options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    console.log(`[KauflandAdapter] Fetching open orders for company ${companyId}...`)
    return []
  }
}

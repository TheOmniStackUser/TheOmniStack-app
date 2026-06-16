// ============================================================================
// MARKETPLACE ADAPTER — Base Interface
// All marketplace connectors implement this interface (Adapter Pattern).
// ============================================================================

export type MarketplaceOrderItem = {
  sku?: string
  asin?: string
  title: string
  quantity: number
  unitPrice: number
  taxRate: number
}

export type MarketplaceAddress = {
  name: string
  company?: string
  addressAddition?: string
  phone?: string
  street: string
  city: string
  zip: string
  country: string
}

export type MarketplaceProduct = {
  marketplaceProductId?: string
  sku: string
  title: string
  price?: number
  stock?: number
  rawPayload?: unknown
}

export type NormalizedOrder = {
  marketplaceOrderId: string
  marketplace: string
  purchaseDate: Date
  buyer: {
    name: string
    email?: string
    phone?: string
  }
  shippingAddress: MarketplaceAddress
  currency: string
  items: MarketplaceOrderItem[]
  totalAmount: number
  taxAmount: number
  totalWeight?: number // total weight in kg
  rawPayload: unknown // preserved verbatim for audit trail
}

export interface MarketplaceAdapter {
  readonly marketplace: NormalizedOrder['marketplace']
  /**
   * Fetch all unshipped orders for the given date range.
   * Adapters are responsible for pagination internally.
   */
  fetchUnshippedOrders(companyId: string, options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]>
  
  /**
   * Confirm shipment for an order on the marketplace.
   */
  confirmShipment?(
    marketplaceOrderId: string, 
    trackingNumber: string, 
    carrier: string, 
    returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void>

  /**
   * Upload an invoice PDF to the marketplace.
   */
  uploadInvoice?(
    marketplaceOrderId: string,
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<boolean>

  /**
   * Fetches the official invoice PDF from the marketplace.
   */
  getInvoice?(
    marketplaceOrderId: string,
    rawOrderPayload?: unknown
  ): Promise<Buffer | { pdfBuffer: Buffer; receiptNumber?: string } | null>

  /**
   * Fetches the official delivery note PDF from the marketplace.
   */
  getDeliveryNote?(
    marketplaceOrderId: string,
    rawOrderPayload?: unknown
  ): Promise<Buffer>

  /**
   * Refunds an order (full or partial) on the marketplace.
   */
  refundOrder?(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean>

  /**
   * Fetch products from the marketplace for inventory mapping.
   */
  fetchProducts?(
    companyId: string,
    onProgress?: (progress: number, total: number, message: string) => Promise<void>
  ): Promise<MarketplaceProduct[]>

  /**
   * Sync inventory and/or prices back to the marketplace.
   */
  updateListings?(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void>

  /**
   * Marks a return as received on the marketplace if applicable.
   */
  receiveReturnItems?(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean | 'ACCEPTED'>
}

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
  street: string
  city: string
  zip: string
  country: string
}

export type NormalizedOrder = {
  marketplaceOrderId: string
  marketplace: string
  purchaseDate: Date
  buyer: {
    name: string
    email?: string
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
    marketplaceOrderId: string
  ): Promise<Buffer | { pdfBuffer: Buffer; receiptNumber?: string } | null>

  /**
   * Fetches the official delivery note PDF from the marketplace.
   */
  getDeliveryNote?(
    marketplaceOrderId: string
  ): Promise<Buffer>

  /**
   * Refunds an order (full or partial) on the marketplace.
   */
  refundOrder?(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean>
}

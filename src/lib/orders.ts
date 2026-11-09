import { get2LetterCountryCode } from './countries'

/**
 * Checks whether an order is an Amazon order destined for Switzerland (CH).
 * 
 * Under Amazon VCS / Marketplace Facilitator regulations, Amazon directly handles
 * VAT and customer invoicing for Swiss shipments. Sellers must not generate, upload,
 * or send merchant invoices for these orders.
 */
export function isAmazonSwitzerlandOrder(order: {
  marketplace?: string | null
  shippingCountry?: string | null
  shipping_country?: string | null
  recipientCountry?: string | null
  recipient_country?: string | null
  rawPayload?: any
  raw_payload?: any
} | null | undefined): boolean {
  if (!order) return false

  const mp = (order.marketplace || '').toLowerCase().trim()
  if (mp !== 'amazon') return false

  const payload = order.rawPayload || order.raw_payload
  const rawCountry = (
    order.shippingCountry ||
    order.shipping_country ||
    order.recipientCountry ||
    order.recipient_country ||
    payload?.rawOrder?.ShippingAddress?.CountryCode ||
    payload?.ShippingAddress?.CountryCode ||
    ''
  )

  const code = get2LetterCountryCode(rawCountry)
  return code === 'CH'
}

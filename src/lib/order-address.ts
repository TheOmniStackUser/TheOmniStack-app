export type ResolvedBillingAddress = {
  name: string
  company: string
  addressAddition: string
  street: string
  zip: string
  city: string
  country: string
  phone: string
  email?: string
}

export type OrderAddressLike = {
  buyerName?: string | null
  buyerCompany?: string | null
  buyerEmail?: string | null
  buyerPhone?: string | null
  shippingName?: string | null
  shippingCompany?: string | null
  shippingAddressAddition?: string | null
  shippingStreet?: string | null
  shippingZip?: string | null
  shippingCity?: string | null
  shippingCountry?: string | null
  shippingPhone?: string | null
  rawPayload?: unknown
  invoice?: {
    recipientName?: string | null
    recipientCompany?: string | null
    recipientAddressAddition?: string | null
    recipientStreet?: string | null
    recipientZip?: string | null
    recipientCity?: string | null
    recipientCountry?: string | null
    recipientPhone?: string | null
    recipientEmail?: string | null
  } | null
}

/**
 * Resolves the genuine billing address for an order.
 * Priority:
 * 1. Existing linked invoice recipient details
 * 2. Explicit manual billing address in rawPayload
 * 3. Otto invoiceAddress in rawPayload
 * 4. Mirakl customer.billing_address in rawPayload
 * 5. About You billing_street in rawPayload
 * 6. Shopify billing_address in rawPayload
 * 7. Kaufland billing_address in rawPayload
 * 8. Amazon rawOrder.ShippingAddress (original snapshot before any delivery address edits)
 * 9. Fallback to order's initial / current shipping address
 */
export function resolveBillingAddress(order: OrderAddressLike): ResolvedBillingAddress | null {
  // 1. Linked invoice recipient address
  if (order.invoice && order.invoice.recipientStreet) {
    return {
      name: order.invoice.recipientName || order.buyerName || order.shippingName || '',
      company: order.invoice.recipientCompany || '',
      addressAddition: order.invoice.recipientAddressAddition || '',
      street: order.invoice.recipientStreet,
      zip: order.invoice.recipientZip || '',
      city: order.invoice.recipientCity || '',
      country: order.invoice.recipientCountry || 'DE',
      phone: order.invoice.recipientPhone || order.buyerPhone || order.shippingPhone || '',
      email: order.invoice.recipientEmail || order.buyerEmail || ''
    }
  }

  const raw = typeof order.rawPayload === 'string'
    ? (() => {
        try {
          return JSON.parse(order.rawPayload)
        } catch {
          return null
        }
      })()
    : (order.rawPayload as any)

  if (raw) {
    // 2. Explicit manual billing address
    if (raw.manualBillingAddress) {
      const mb = raw.manualBillingAddress
      return {
        name: mb.name || order.buyerName || order.shippingName || '',
        company: mb.company || '',
        addressAddition: mb.addressAddition || '',
        street: mb.street || '',
        zip: mb.zip || '',
        city: mb.city || '',
        country: mb.country || 'DE',
        phone: mb.phone || order.buyerPhone || order.shippingPhone || '',
        email: mb.email || order.buyerEmail || ''
      }
    }

    // 3. Otto invoice address structure
    if (raw.invoiceAddress) {
      const name = `${raw.invoiceAddress.firstName || ''} ${raw.invoiceAddress.lastName || ''}`.trim() || raw.invoiceAddress.companyName || order.buyerName || order.shippingName || ''
      return {
        name,
        company: raw.invoiceAddress.companyName || raw.invoiceAddress.company || '',
        addressAddition: raw.invoiceAddress.addition || '',
        street: `${raw.invoiceAddress.street || ''} ${raw.invoiceAddress.houseNumber || ''}`.trim(),
        zip: raw.invoiceAddress.zipCode || '',
        city: raw.invoiceAddress.city || '',
        country: raw.invoiceAddress.countryCode || 'DE',
        phone: raw.invoiceAddress.phoneNumber || order.buyerPhone || order.shippingPhone || '',
        email: raw.invoiceAddress.email || order.buyerEmail || ''
      }
    }

    // 4. Mirakl customer billing address structure
    if (raw.customer?.billing_address) {
      const addr = raw.customer.billing_address
      const name = `${addr.firstname || ''} ${addr.lastname || ''}`.trim() || order.buyerName || order.shippingName || ''
      return {
        name,
        company: addr.company || '',
        addressAddition: addr.additional_info || '',
        street: `${addr.street_1 || ''} ${addr.street_2 || ''}`.trim(),
        zip: addr.zip_code || '',
        city: addr.city || '',
        country: addr.country_iso_code || addr.country || 'DE',
        phone: addr.phone || addr.phone_secondary || order.buyerPhone || order.shippingPhone || '',
        email: order.buyerEmail || ''
      }
    }

    // 5. About You structure
    if (raw.billing_street) {
      return {
        name: order.buyerName || order.shippingName || '',
        company: raw.billing_company || '',
        addressAddition: raw.billing_address_addition || '',
        street: raw.billing_street,
        zip: raw.billing_zip_code || '',
        city: raw.billing_city || '',
        country: raw.billing_country_code || 'DE',
        phone: order.buyerPhone || order.shippingPhone || '',
        email: order.buyerEmail || ''
      }
    }

    // 6. Shopify structure
    if (raw.billing_address) {
      const name = `${raw.billing_address.first_name || ''} ${raw.billing_address.last_name || ''}`.trim() || raw.billing_address.company || order.buyerName || order.shippingName || ''
      return {
        name,
        company: raw.billing_address.company || '',
        addressAddition: raw.billing_address.address2 || '',
        street: `${raw.billing_address.address1 || ''} ${raw.billing_address.address2 || ''}`.trim(),
        zip: raw.billing_address.zip || '',
        city: raw.billing_address.city || '',
        country: raw.billing_address.country_code || raw.billing_address.country || 'DE',
        phone: raw.billing_address.phone || order.buyerPhone || order.shippingPhone || '',
        email: order.buyerEmail || ''
      }
    }

    // 7. Kaufland structure
    const kauflandBilling = Array.isArray(raw) ? raw[0]?.billing_address : raw.billing_address
    if (kauflandBilling && (kauflandBilling.street || kauflandBilling.postcode)) {
      const name = `${kauflandBilling.first_name || ''} ${kauflandBilling.last_name || ''}`.trim() || kauflandBilling.company_name || order.buyerName || ''
      return {
        name,
        company: kauflandBilling.company_name || '',
        addressAddition: kauflandBilling.additional_field || '',
        street: `${kauflandBilling.street || ''} ${kauflandBilling.house_number || ''}`.trim(),
        zip: kauflandBilling.postcode || '',
        city: kauflandBilling.city || '',
        country: kauflandBilling.country || 'DE',
        phone: kauflandBilling.phone || order.buyerPhone || order.shippingPhone || '',
        email: order.buyerEmail || ''
      }
    }

    // 8. Amazon rawOrder original shipping address snapshot
    // If the delivery address was previously modified, rawOrder.ShippingAddress preserves
    // the original address placed by the customer on Amazon.
    if (raw.rawOrder?.ShippingAddress) {
      const sa = raw.rawOrder.ShippingAddress
      let street = sa.AddressLine1 || ''
      let addressAddition = sa.AddressLine2 || ''
      let company = sa.CompanyName || ''
      const addressLine3 = sa.AddressLine3 || ''
      const hasNoNumber = (str: string) => !/\d/.test(str)
      const hasLetterAndNumber = (str: string) => /[a-zA-ZäöüßÄÖÜ]/.test(str) && /\d/.test(str)

      if (street && addressAddition && hasNoNumber(street) && hasLetterAndNumber(addressAddition) && addressAddition.length > 4) {
        if (!company) {
          company = street
          street = addressAddition
          addressAddition = addressLine3
        } else {
          const temp = street
          street = addressAddition
          addressAddition = temp + (addressLine3 ? `, ${addressLine3}` : '')
        }
      } else {
        if (addressAddition && addressLine3) {
          addressAddition = `${addressAddition}, ${addressLine3}`
        } else if (!addressAddition && addressLine3) {
          addressAddition = addressLine3
        }
      }

      return {
        name: sa.Name || order.buyerName || order.shippingName || '',
        company,
        addressAddition,
        street,
        zip: sa.PostalCode || '',
        city: sa.City || '',
        country: sa.CountryCode || 'DE',
        phone: sa.Phone || order.buyerPhone || '',
        email: raw.rawOrder?.BuyerEmail || order.buyerEmail || ''
      }
    }
  }

  // 9. Fallback: order's current shipping address
  if (order.shippingStreet) {
    return {
      name: order.buyerName || order.shippingName || '',
      company: order.shippingCompany || '',
      addressAddition: order.shippingAddressAddition || '',
      street: order.shippingStreet,
      zip: order.shippingZip || '',
      city: order.shippingCity || '',
      country: order.shippingCountry || 'DE',
      phone: order.buyerPhone || order.shippingPhone || '',
      email: order.buyerEmail || ''
    }
  }

  return null
}

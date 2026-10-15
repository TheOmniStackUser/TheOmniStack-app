import { MarketplaceAdapter, NormalizedOrder } from './base'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { productMappings } from '@/db/schema/products'
import { eq, and } from 'drizzle-orm'

export class ShopifyAdapter implements MarketplaceAdapter {
  readonly marketplace = 'shopify'

  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string; toDate?: string }): Promise<NormalizedOrder[]> {
    // 1. Get credentials
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'shopify'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.environment) {
      console.warn(`[Shopify] No active credentials found for company ${companyId}`)
      return []
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) {
      shopUrl = `https://${shopUrl}`
    }
    shopUrl = shopUrl.replace(/\/$/, '')

    try {
      const accessToken = await this.getAccessToken(integration)
      return await this.fetchWithToken(shopUrl, accessToken, options)
    } catch (err) {
      console.error(`[Shopify] Error fetching unshipped orders:`, err)
      throw err
    }
  }

  private async fetchWithToken(shopUrl: string, token: string, options?: any): Promise<NormalizedOrder[]> {
    const endpoint = `${shopUrl}/admin/api/2024-01/orders.json?status=any&limit=50`
    const res = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Shopify API Fehler: ${res.status} - ${errText}`)
    }

    const data = await res.json()
    return this.mapOrders(data.orders || [])
  }

  private mapOrders(orders: any[]): NormalizedOrder[] {
    return orders.map((order: any): NormalizedOrder => {
      // Shipping address
      const sa = order.shipping_address || order.billing_address || {}
      
      const taxAmount = parseFloat(order.total_tax || '0')
      const totalAmount = parseFloat(order.total_price || '0')
      
      const totalWeightKg = order.total_weight ? order.total_weight / 1000 : undefined

      const items = (order.line_items || []).map((li: any) => {
        const unitPrice = parseFloat(li.price || '0')
        // Shopify line items don't provide tax rate easily, but we can try to guess it from unit tax or default to 19%
        const liTaxLines = li.tax_lines || []
        const taxRate = liTaxLines.length > 0 ? liTaxLines[0].rate : 0.19

        const resolvedSku = (li.sku && String(li.sku).trim().length > 0)
          ? String(li.sku).trim()
          : (li.variant_id ? String(li.variant_id) : String(li.id))

        return {
          sku: resolvedSku,
          title: li.title || 'Shopify Item',
          quantity: li.quantity,
          unitPrice,
          taxRate,
        }
      })

      return {
        marketplaceOrderId: order.id.toString(),
        marketplace: 'shopify',
        purchaseDate: new Date(order.created_at),
        buyer: {
          name: sa.name || order.customer?.first_name + ' ' + order.customer?.last_name || 'Unbekannt',
          email: order.contact_email || order.email || order.customer?.email,
          phone: order.customer?.phone || order.billing_address?.phone || undefined,
        },
        shippingAddress: {
          name: sa.name || order.customer?.first_name + ' ' + order.customer?.last_name || 'Unbekannt',
          company: sa.company || undefined,
          addressAddition: sa.address2 || undefined,
          phone: sa.phone || undefined,
          street: `${sa.address1 || ''} ${sa.address2 || ''}`.trim(),
          city: sa.city || '',
          zip: sa.zip || '',
          country: sa.country_code || 'DE',
        },
        currency: order.currency || 'EUR',
        items,
        totalAmount,
        taxAmount,
        totalWeight: totalWeightKg,
        rawPayload: order, // Preserve raw Shopify payload
      }
    })
  }

  async confirmShipment(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    // 1. Get credentials (in a real app, you might pass companyId down, or lookup via DB)
    // To do this, we need companyId. Let's look it up via marketplaceOrderId if not provided
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
      .limit(1)

    if (!orderRow) {
       console.warn(`[Shopify] Order ${marketplaceOrderId} not found in DB`)
       return
    }

    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, orderRow.companyId),
          eq(marketplaceIntegrations.type, 'shopify'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.environment) {
      console.warn(`[Shopify] No active credentials found for company ${orderRow.companyId}`)
      return
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
    shopUrl = shopUrl.replace(/\/$/, '')

    const accessToken = await this.getAccessToken(integration)

    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    }

    // Fetch fulfillment orders for the order
    const foRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/fulfillment_orders.json`, { headers })
    if (!foRes.ok) {
       console.error(`[Shopify] Failed to fetch fulfillment orders for ${marketplaceOrderId}`)
       return
    }
    const foData = await foRes.json()
    const fulfillmentOrders = foData.fulfillment_orders || []
    const openFulfillmentOrders = fulfillmentOrders.filter((fo: any) => fo.status === 'open' || fo.status === 'in_progress')

    if (openFulfillmentOrders.length === 0) {
       console.log(`[Shopify] No open fulfillment orders found for order ${marketplaceOrderId}. It may already be fulfilled.`)
       return
    }

    for (const fo of openFulfillmentOrders) {
      const fulfillmentPayload = {
        fulfillment: {
          message: 'The order has been shipped.',
          notify_customer: true,
          tracking_info: {
            number: trackingNumber,
            company: carrier,
          },
          line_items_by_fulfillment_order: [{ fulfillment_order_id: fo.id }]
        }
      }

      const fulfillRes = await fetch(`${shopUrl}/admin/api/2024-01/fulfillments.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(fulfillmentPayload)
      })

      if (!fulfillRes.ok) {
         console.error(`[Shopify] Failed to fulfill order ${marketplaceOrderId} (FO: ${fo.id}): ${fulfillRes.statusText}`)
         const errorText = await fulfillRes.text()
         console.error(errorText)
         // Don't throw immediately, try to fulfill others if there are multiple
      }
    }
    
    console.log(`[Shopify] Shipment confirmed for order ${marketplaceOrderId}`)
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number; title?: string }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[Shopify] Refunding order ${marketplaceOrderId}...`)
    try {
      // 1. Fetch order from DB to get companyId
      const [orderRow] = await db
        .select()
        .from(orders)
        .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
        .limit(1)

      if (!orderRow) {
        console.warn(`[Shopify] Order ${marketplaceOrderId} not found in DB`)
        throw new Error(`Bestellung ${marketplaceOrderId} nicht in der Datenbank gefunden.`)
      }

      // 2. Fetch active Shopify integration
      const [integration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, orderRow.companyId),
            eq(marketplaceIntegrations.type, 'shopify'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${orderRow.companyId}`)
        throw new Error(`Keine aktive Shopify-Integration für dieses Unternehmen gefunden.`)
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      // 4. Fetch the latest order details from Shopify to get up-to-date line_items and financial status
      console.log(`[Shopify] Fetching latest order details from Shopify API for ${marketplaceOrderId}...`)
      let shopifyOrder: any = null
      try {
        const getOrderRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}.json`, {
          headers,
          cache: 'no-store'
        })
        if (getOrderRes.ok) {
          const orderData = await getOrderRes.json()
          shopifyOrder = orderData.order
        }
      } catch (e) {
        console.warn(`[Shopify] Could not fetch fresh order details from Shopify API:`, e)
      }

      if (!shopifyOrder || !shopifyOrder.line_items) {
        shopifyOrder = rawOrderPayload as any
      }

      if (!shopifyOrder || !shopifyOrder.line_items) {
        throw new Error(`Keine Shopify Line Items für Bestellung ${marketplaceOrderId} gefunden.`)
      }

      // 5. Map SKU or Line Item ID or Variant ID to Shopify line_item IDs
      const refundLineItems: { line_item_id: number; quantity: number; restock_type: string }[] = []
      for (const item of refundItems) {
        const itemSkuTrimmed = (item.sku || '').trim().toLowerCase()
        const itemTitleTrimmed = (item.title || '').trim().toLowerCase()

        let matchingLineItem = shopifyOrder.line_items.find((li: any) => {
          const skuMatch = li.sku && itemSkuTrimmed && li.sku.toString().trim().toLowerCase() === itemSkuTrimmed
          const variantMatch = li.variant_id && item.sku && li.variant_id.toString().trim() === item.sku.trim()
          const lineItemIdMatch = li.id && item.sku && li.id.toString().trim() === item.sku.trim()
          const titleMatch = itemTitleTrimmed && (
            (li.title && li.title.toString().trim().toLowerCase() === itemTitleTrimmed) ||
            (li.name && li.name.toString().trim().toLowerCase() === itemTitleTrimmed)
          )
          return skuMatch || variantMatch || lineItemIdMatch || titleMatch
        })

        // Fallback: If not matched and item.sku exists, check productMappings in DB
        if (!matchingLineItem && item.sku) {
          try {
            const { products, productMappings } = await import('@/db/schema/products')
            const localProduct = await db.query.products.findFirst({
              where: and(eq(products.sku, item.sku), eq(products.companyId, orderRow.companyId))
            })
            if (localProduct) {
              const mappings = await db.query.productMappings.findMany({
                where: and(
                  eq(productMappings.productId, localProduct.id),
                  eq(productMappings.marketplace, 'shopify')
                )
              })
              for (const map of mappings) {
                matchingLineItem = shopifyOrder.line_items.find((li: any) => {
                  return (map.marketplaceSku && li.sku && li.sku.toString().trim().toLowerCase() === map.marketplaceSku.trim().toLowerCase()) ||
                    (map.marketplaceSku && li.variant_id && li.variant_id.toString().trim() === map.marketplaceSku.trim()) ||
                    (map.marketplaceProductId && li.variant_id && li.variant_id.toString().trim() === map.marketplaceProductId.trim()) ||
                    (map.marketplaceProductId && li.product_id && li.product_id.toString().trim() === map.marketplaceProductId.trim())
                })
                if (matchingLineItem) break
              }
            }
          } catch (e) {
            console.warn(`[Shopify] Could not resolve line item via productMappings:`, e)
          }
        }

        // Fallback: If single item order and single refund item, match directly
        if (!matchingLineItem && shopifyOrder.line_items.length === 1 && refundItems.length === 1) {
          console.log(`[Shopify] Single line item order fallback: matching line item ${shopifyOrder.line_items[0].id}`)
          matchingLineItem = shopifyOrder.line_items[0]
        }

        if (!matchingLineItem) {
          console.warn(`[Shopify] No matching line item found on Shopify for SKU ${item.sku}`)
          continue
        }
        refundLineItems.push({
          line_item_id: matchingLineItem.id,
          quantity: item.quantity,
          restock_type: 'no_restock'
        })
      }

      if (refundLineItems.length === 0) {
        console.warn(`[Shopify] No valid line items to refund.`)
        throw new Error(`Keine passenden Artikel in der Shopify-Bestellung gefunden (SKU: ${refundItems.map(i => i.sku).join(', ')}).`)
      }

      // 6. Calculate refund with Shopify to retrieve suggested monetary transactions
      let transactions: any[] = []
      try {
        console.log(`[Shopify] Calculating refund for order ${marketplaceOrderId}...`)
        const calcRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/refunds/calculate.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            refund: {
              shipping: { full_refund: false },
              refund_line_items: refundLineItems
            }
          })
        })

        if (calcRes.ok) {
          const calcData = await calcRes.json()
          if (calcData.refund?.transactions && Array.isArray(calcData.refund.transactions)) {
            transactions = calcData.refund.transactions.map((tx: any) => ({
              parent_id: tx.parent_id || tx.id,
              amount: tx.amount,
              kind: 'refund',
              gateway: tx.gateway,
              currency: tx.currency || shopifyOrder.currency || 'EUR'
            }))
            console.log(`[Shopify] Calculated refund transactions:`, transactions)
          }
        } else {
          const errText = await calcRes.text()
          console.warn(`[Shopify] Calculate refund endpoint returned ${calcRes.status}: ${errText}`)
        }
      } catch (calcErr) {
        console.error(`[Shopify] Error calculating refund:`, calcErr)
      }

      // 7. Robust Fallback: If calculate.json did not return transactions, but the order is paid, lookup parent transaction
      if (transactions.length === 0 && (shopifyOrder.financial_status === 'paid' || shopifyOrder.financial_status === 'partially_paid')) {
        console.log(`[Shopify] Calculate returned no transactions for paid order ${marketplaceOrderId}. Attempting fallback via order transactions...`)
        try {
          const txRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/transactions.json`, {
            headers,
            cache: 'no-store'
          })
          if (txRes.ok) {
            const txData = await txRes.json()
            const parentTx = (txData.transactions || []).find((t: any) => (t.kind === 'sale' || t.kind === 'capture') && t.status === 'success')
            if (parentTx) {
              let refundAmount = 0
              for (const rli of refundLineItems) {
                const li = shopifyOrder.line_items.find((item: any) => item.id === rli.line_item_id)
                if (li) {
                  const price = parseFloat(li.price || '0')
                  refundAmount += price * rli.quantity
                }
              }
              if (refundAmount > 0) {
                transactions = [{
                  parent_id: parentTx.id,
                  amount: refundAmount.toFixed(2),
                  kind: 'refund',
                  gateway: parentTx.gateway,
                  currency: parentTx.currency || shopifyOrder.currency || 'EUR'
                }]
                console.log(`[Shopify] Fallback created refund transaction:`, transactions)
              }
            }
          }
        } catch (fbErr) {
          console.error(`[Shopify] Fallback transaction lookup failed:`, fbErr)
        }
      }

      // 8. Post Refund
      const refundPayload: any = {
        refund: {
          currency: shopifyOrder.currency || 'EUR',
          notify: true,
          note: 'OmniScan Return Refund',
          shipping: { full_refund: false },
          refund_line_items: refundLineItems
        }
      }

      if (transactions.length > 0) {
        refundPayload.refund.transactions = transactions
      }

      console.log(`[Shopify] Sending refund request for order ${marketplaceOrderId}...`)
      const refundRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/refunds.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(refundPayload)
      })

      if (!refundRes.ok) {
        const errText = await refundRes.text()
        console.error(`[Shopify] Refund request failed: ${refundRes.status} - ${errText}`)
        // If it failed with transactions, retry once without transactions payload
        if (transactions.length > 0) {
          console.log(`[Shopify] Retrying refund without transactions payload...`)
          delete refundPayload.refund.transactions
          const retryRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/refunds.json`, {
            method: 'POST',
            headers,
            body: JSON.stringify(refundPayload)
          })
          if (retryRes.ok) {
            console.log(`[Shopify] Refund retry without transactions succeeded for order ${marketplaceOrderId}`)
            return true
          }
          const retryErrText = await retryRes.text()
          console.error(`[Shopify] Refund retry failed: ${retryRes.status} - ${retryErrText}`)
          throw new Error(`Shopify API Fehler: ${retryErrText}`)
        }
        throw new Error(`Shopify Refund API Error: ${errText}`)
      }

      console.log(`[Shopify] Refund processed successfully for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[Shopify] Error during refund:`, error)
      throw error
    }
  }

  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    try {
      const [integration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, companyId),
            eq(marketplaceIntegrations.type, 'shopify'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${companyId}`)
        return []
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      let productsUrl: string | null = `${shopUrl}/admin/api/2024-01/products.json?limit=250`
      const allProducts: any[] = []

      while (productsUrl) {
        console.log(`[Shopify] Fetching products via GET ${productsUrl}...`)
        const response: Response = await fetch(productsUrl, { 
          headers,
          cache: 'no-store'
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Shopify API fetchProducts failed: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        allProducts.push(...(data.products || []))

        const linkHeader = response.headers.get('link')
        productsUrl = null
        if (linkHeader) {
          const links = linkHeader.split(',')
          const nextLink = links.find(l => l.includes('rel="next"'))
          if (nextLink) {
            const match = nextLink.match(/<([^>]+)>/)
            if (match) {
              productsUrl = match[1]
            }
          }
        }
      }

      const results: import('./base').MarketplaceProduct[] = []
      for (const product of allProducts) {
        // Skip Gift Cards as they don't have physical inventory
        if (product.product_type === 'Gift Card' || product.template_suffix === 'gift_card') {
          continue
        }

        for (const variant of product.variants || []) {
          results.push({
            marketplaceProductId: variant.id.toString(), // Shopify Variant ID
            sku: variant.sku || variant.id.toString(),
            title: `${product.title} ${variant.title !== 'Default Title' ? variant.title : ''}`.trim(),
            price: parseFloat(variant.price || '0'),
            stock: variant.inventory_quantity || 0,
            rawPayload: { product, variant }
          })
        }
      }

      return results
    } catch (error) {
      console.error(`[Shopify] Error fetching products:`, error)
      throw error
    }
  }

  async updateListings(
    companyId: string, 
    updates: { 
      sku: string; 
      marketplaceProductId?: string; 
      stock?: number; 
      price?: number; 
      reducedPrice?: number; 
      msrp?: number; 
      fallbackPrice?: number; 
      saleStartDate?: Date | null; 
      saleEndDate?: Date | null; 
      gpsrDetails?: any; 
    }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const [integration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, companyId),
            eq(marketplaceIntegrations.type, 'shopify'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${companyId}`)
        return
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      // We only need location_id if at least one update includes stock
      const hasStockUpdates = updates.some(u => u.stock !== undefined)
      let locationId = ''
      if (hasStockUpdates) {
        const locRes = await fetch(`${shopUrl}/admin/api/2024-01/locations.json`, { headers })
        if (locRes.ok) {
          const locData = await locRes.json()
          locationId = locData.locations?.[0]?.id?.toString() || ''
        }
      }

      for (const update of updates) {
        let variantId = update.marketplaceProductId

        // Fallback: If variantId is not provided, look it up by SKU in productMappings
        if (!variantId && update.sku) {
          const [mapping] = await db
            .select({ marketplaceProductId: productMappings.marketplaceProductId })
            .from(productMappings)
            .where(
              and(
                eq(productMappings.companyId, companyId),
                eq(productMappings.marketplaceSku, update.sku),
                eq(productMappings.marketplace, 'shopify')
              )
            )
            .limit(1)
          if (mapping?.marketplaceProductId) {
            variantId = mapping.marketplaceProductId
          }
        }

        if (!variantId) {
          console.warn(`[Shopify] Skipping update for SKU ${update.sku}: No variant ID found`)
          continue
        }

        let inventoryItemId = ''

        // Check if price / compare-at price update is needed
        const hasPriceUpdate = update.price !== undefined || update.reducedPrice !== undefined || update.msrp !== undefined || update.fallbackPrice !== undefined

        if (hasPriceUpdate) {
          const standardPrice = update.price !== undefined ? update.price : update.fallbackPrice

          let sellingPrice: number | undefined
          let compareAtPrice: number | null = null

          const now = new Date()
          const isSaleDateValid = (!update.saleStartDate || new Date(update.saleStartDate) <= now) &&
                                  (!update.saleEndDate || new Date(update.saleEndDate) >= now)

          if (update.reducedPrice !== undefined && update.reducedPrice !== null && update.reducedPrice > 0 && isSaleDateValid) {
            // Sale is active: price = reduced price, compare_at_price = standard price (or msrp if higher)
            sellingPrice = update.reducedPrice
            if (standardPrice !== undefined && standardPrice > update.reducedPrice) {
              compareAtPrice = (update.msrp && update.msrp > standardPrice) ? update.msrp : standardPrice
            } else if (update.msrp && update.msrp > update.reducedPrice) {
              compareAtPrice = update.msrp
            }
          } else {
            // No sale active (or discount removed)
            sellingPrice = standardPrice
            // If MSRP is higher than standard price, display it as compare-at price; otherwise clear compare-at price
            if (update.msrp && standardPrice !== undefined && update.msrp > standardPrice) {
              compareAtPrice = update.msrp
            } else {
              compareAtPrice = null
            }
          }

          if (sellingPrice !== undefined) {
            const variantPayload: any = {
              variant: {
                id: variantId,
                price: Number(sellingPrice).toFixed(2),
                compare_at_price: compareAtPrice !== null ? Number(compareAtPrice).toFixed(2) : null
              }
            }

            console.log(`[Shopify] Updating variant ${variantId} (SKU: ${update.sku}): price=${variantPayload.variant.price}, compare_at_price=${variantPayload.variant.compare_at_price}`)
            const vPutRes = await fetch(`${shopUrl}/admin/api/2024-01/variants/${variantId}.json`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(variantPayload)
            })

            if (!vPutRes.ok) {
              const errBody = await vPutRes.text()
              console.error(`[Shopify] Variant ${variantId} price update failed: ${vPutRes.status} - ${errBody}`)
              throw new Error(`Shopify API variant update error (${vPutRes.status}): ${errBody}`)
            }

            const putData = await vPutRes.json()
            if (putData.variant?.inventory_item_id) {
              inventoryItemId = putData.variant.inventory_item_id.toString()
            }
          }
        }

        // If we need to update stock, we need the inventory_item_id
        if (update.stock !== undefined && locationId) {
          if (!inventoryItemId) {
            const vRes = await fetch(`${shopUrl}/admin/api/2024-01/variants/${variantId}.json`, { headers })
            if (vRes.ok) {
              const vData = await vRes.json()
              inventoryItemId = vData.variant?.inventory_item_id?.toString() || ''
            }
          }

          if (inventoryItemId) {
            const levelsRes = await fetch(`${shopUrl}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`, { headers })

            if (levelsRes.ok) {
              const levelsData = await levelsRes.json()
              const levels = levelsData.inventory_levels || []

              if (levels.length > 0) {
                // Set the target stock on the first location, and 0 on all others to ensure total sum is exact
                for (let i = 0; i < levels.length; i++) {
                  const level = levels[i]
                  const stockToSet = i === 0 ? update.stock : 0

                  const invPayload = {
                    location_id: level.location_id,
                    inventory_item_id: inventoryItemId,
                    available: stockToSet
                  }
                  const setRes = await fetch(`${shopUrl}/admin/api/2024-01/inventory_levels/set.json`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(invPayload)
                  })
                  if (!setRes.ok) {
                    const errText = await setRes.text()
                    console.error(`[Shopify] Inventory level update failed for location ${level.location_id}: ${setRes.status} - ${errText}`)
                  }
                }
              } else if (locationId) {
                // Fallback if no inventory levels exist yet but we have a default location
                const invPayload = {
                  location_id: locationId,
                  inventory_item_id: inventoryItemId,
                  available: update.stock
                }
                const setRes = await fetch(`${shopUrl}/admin/api/2024-01/inventory_levels/set.json`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(invPayload)
                })
                if (!setRes.ok) {
                  const errText = await setRes.text()
                  console.error(`[Shopify] Fallback inventory level update failed: ${setRes.status} - ${errText}`)
                }
              }
            }
          }
        }
      }

      console.log(`[Shopify] Listings successfully updated.`)
    } catch (error) {
      console.error(`[Shopify] Error updating listings:`, error)
      throw error
    }
  }

  private async getAccessToken(integration: any): Promise<string> {
    const now = new Date();
    // Use token if it exists and (has no expiry, or expires more than 1 min from now)
    if (integration.accessToken && (!integration.expiresAt || integration.expiresAt > new Date(now.getTime() + 60000))) {
      return integration.accessToken;
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
    shopUrl = shopUrl.replace(/\/$/, '')

    // If we have a refresh token (expiring offline token flow), we MUST refresh it
    if (integration.refreshToken) {
      const clientId = process.env.SHOPIFY_CLIENT_ID || integration.clientId;
      const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || integration.clientSecret;

      if (!clientId || !clientSecret) {
        throw new Error(`Shopify: Missing credentials for token refresh`);
      }

      console.log(`[Shopify] Refreshing expired access token for ${shopUrl}...`);
      const refreshBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refreshToken
      });

      const refreshRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshBody
      });

      if (!refreshRes.ok) {
        const errText = await refreshRes.text();
        throw new Error(`Shopify Refresh Fehler: ${refreshRes.status} - ${errText}`);
      }

      const refreshData = await refreshRes.json();
      const newAccessToken = refreshData.access_token;
      const newRefreshToken = refreshData.refresh_token;
      const newExpiresAt = refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000) : null;

      // Persist the new tokens (crucial: old refresh token is voided immediately)
      await db.update(marketplaceIntegrations)
        .set({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date()
        })
        .where(eq(marketplaceIntegrations.id, integration.id));

      return newAccessToken;
    }

    // Fallback for custom apps using client_credentials
    if (integration.clientId && integration.clientSecret && !integration.clientSecret.startsWith('shpat_')) {
      const tokenRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: integration.clientId,
          client_secret: integration.clientSecret,
          grant_type: 'client_credentials'
        })
      })
      
      if (!tokenRes.ok) {
        const errText = await tokenRes.text()
        throw new Error(`Shopify Auth Fehler: ${tokenRes.status} - ${errText}`)
      }
      
      const data = await tokenRes.json()
      return data.access_token;
    }

    // Fallback for static tokens
    if (integration.clientSecret && integration.clientSecret.startsWith('shpat_')) return integration.clientSecret;

    throw new Error(`Shopify: Missing credentials for token exchange`);
  }
}

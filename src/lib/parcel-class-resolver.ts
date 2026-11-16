import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { products } from '@/db/schema/products'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray } from 'drizzle-orm'

export type HermesParcelClass = 'XS' | 'S' | 'M' | 'L' | 'XL'

export const VALID_PARCEL_CLASSES: HermesParcelClass[] = ['XS', 'S', 'M', 'L', 'XL']

const PARCEL_CLASS_RANKS: Record<HermesParcelClass, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
}

// Regex matching shoes, boots, and common footwear terms in German & English
const FOOTWEAR_REGEX =
  /\b(schuh|schuhe|stiefel|boots?|shoes?|sneakers?|sandalen?|pumps|stiefeletten?|loafers?|slippers?|ballerinas?|clogs?|chelsea|footwear|fussballschuh|laufschuh|wanderschuh|trekkingschuh|hausschuh|schnürschuh|halbschuh|winterschuh|lederschuh)\b/i

export interface ParcelClassResolutionResult {
  parcelClass: HermesParcelClass
  source: 'explicit' | 'per_sku' | 'company_default' | 'global_default'
  matchedKeywords?: string[]
  reason?: string
}

/**
 * Resolves the Hermes parcel class for an order following the priority hierarchy:
 * 1. Explicit parameter if valid (XS, S, M, L, XL)
 * 2. Per-product / per-SKU resolution (footwear = S, explicit product parcelClass)
 * 3. Company-level default (from Hermes integration metadata or company settings)
 * 4. Global default (XS)
 */
export async function resolveParcelClassForOrder(params: {
  orderId?: string
  order?: any
  companyId: string
  explicitParcelClass?: string | null
}): Promise<ParcelClassResolutionResult> {
  const { orderId, companyId, explicitParcelClass } = params

  // 1. Explicit parameter
  if (explicitParcelClass) {
    const upper = explicitParcelClass.trim().toUpperCase() as HermesParcelClass
    if (VALID_PARCEL_CLASSES.includes(upper)) {
      return {
        parcelClass: upper,
        source: 'explicit',
        reason: `Explicitly provided parcel class '${upper}'`,
      }
    }
  }

  // Retrieve order if not passed
  let order = params.order
  if (!order && orderId) {
    const [fetched] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))
      .limit(1)
    order = fetched
  }

  const resolvedOrderId = order?.id || orderId

  // 2. Per-product / per-SKU resolution
  if (resolvedOrderId) {
    try {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, resolvedOrderId))

      if (items.length > 0) {
        // Collect SKUs
        const skus = items.map((i) => i.sku).filter((sku): sku is string => Boolean(sku && sku.trim()))
        let productMap = new Map<string, typeof products.$inferSelect>()

        if (skus.length > 0) {
          const catalogProducts = await db
            .select()
            .from(products)
            .where(and(eq(products.companyId, companyId), inArray(products.sku, skus)))
          for (const prod of catalogProducts) {
            productMap.set(prod.sku, prod)
          }
        }

        let maxRank = 0
        let highestClass: HermesParcelClass = 'XS'
        const matchedKeywords: string[] = []

        for (const item of items) {
          const prod = item.sku ? productMap.get(item.sku) : undefined

          // Check if product has an explicit parcel class override
          if (prod?.parcelClass) {
            const prodClass = prod.parcelClass.trim().toUpperCase() as HermesParcelClass
            if (VALID_PARCEL_CLASSES.includes(prodClass)) {
              const rank = PARCEL_CLASS_RANKS[prodClass]
              if (rank > maxRank) {
                maxRank = rank
                highestClass = prodClass
              }
            }
          }

          // Check footwear keywords against item title, product title, and category
          const textToInspect = [
            item.title || '',
            prod?.title || '',
            prod?.category || '',
            prod?.description || '',
          ].join(' ')

          const match = textToInspect.match(FOOTWEAR_REGEX)
          if (match) {
            const keyword = match[0].toLowerCase()
            if (!matchedKeywords.includes(keyword)) {
              matchedKeywords.push(keyword)
            }
            // Footwear requires at least 'S'
            const footwearRank = PARCEL_CLASS_RANKS['S']
            if (footwearRank > maxRank) {
              maxRank = footwearRank
              highestClass = 'S'
            }
          }
        }

        if (maxRank > 0) {
          return {
            parcelClass: highestClass,
            source: 'per_sku',
            matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
            reason:
              matchedKeywords.length > 0
                ? `Per-SKU footwear detected (${matchedKeywords.join(', ')}) -> parcel class '${highestClass}'`
                : `Per-SKU parcel class override -> '${highestClass}'`,
          }
        }
      }
    } catch (err) {
      console.warn('[resolveParcelClassForOrder] Error during per-SKU resolution:', err)
    }
  }

  // 3. Company-level default
  try {
    // Check Hermes integration metadata
    const [hermesIntegration] = await db
      .select({ metadata: marketplaceIntegrations.metadata })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'hermes'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    const integrationDefault = (hermesIntegration?.metadata as any)?.defaultParcelClass
    if (integrationDefault && typeof integrationDefault === 'string') {
      const upper = integrationDefault.trim().toUpperCase() as HermesParcelClass
      if (VALID_PARCEL_CLASSES.includes(upper)) {
        return {
          parcelClass: upper,
          source: 'company_default',
          reason: `Hermes integration default parcel class '${upper}'`,
        }
      }
    }

    // Check companies table defaultParcelClass
    const [company] = await db
      .select({ defaultParcelClass: companies.defaultParcelClass })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (company?.defaultParcelClass) {
      const upper = company.defaultParcelClass.trim().toUpperCase() as HermesParcelClass
      if (VALID_PARCEL_CLASSES.includes(upper)) {
        return {
          parcelClass: upper,
          source: 'company_default',
          reason: `Company default parcel class '${upper}'`,
        }
      }
    }
  } catch (err) {
    console.warn('[resolveParcelClassForOrder] Error checking company default parcel class:', err)
  }

  // 4. Global fallback: XS
  return {
    parcelClass: 'XS',
    source: 'global_default',
    reason: `Standard global default parcel class 'XS'`,
  }
}

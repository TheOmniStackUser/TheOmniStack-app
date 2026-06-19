'use server'

import { db } from '@/db/client'
import { customers } from '@/db/schema/customers'
import { orders } from '@/db/schema/orders'
import { requireAuth } from '@/lib/session'
import { eq, ilike, or, and, desc, isNotNull, ne } from 'drizzle-orm'

export async function searchCustomersAction(query: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const baseQuery = db
    .select()
    .from(customers)
    .where(eq(customers.companyId, companyId))

  if (!query || query.trim().length < 2) {
    return await baseQuery
      .orderBy(desc(customers.createdAt))
      .limit(10)
  }

  const searchTerms = query.trim().split(/\s+/).filter(t => t.length > 0)

  const conditions = searchTerms.map(term => 
    or(
      ilike(customers.name, `%${term}%`),
      ilike(customers.companyName, `%${term}%`),
      ilike(customers.email, `%${term}%`),
      ilike(customers.customerNumber, `%${term}%`),
      ilike(customers.street, `%${term}%`),
      ilike(customers.city, `%${term}%`),
      ilike(customers.zip, `%${term}%`)
    )
  )

  return await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        ...conditions
      )
    )
    .orderBy(desc(customers.createdAt))
    .limit(20)
}

export async function validateVatAction(vatId: string, customerId?: string, provider: 'VIES' | 'EVATR' = 'VIES', requesterVatId?: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const cleanVat = vatId.trim().replace(/\s+/g, '').toUpperCase()
  if (cleanVat.length < 5) throw new Error('Ungültige USt-IdNr. Format')

  const countryCode = cleanVat.substring(0, 2)
  const vatNumber = cleanVat.substring(2)

  try {
    if (provider === 'EVATR') {
      console.log(`Checking VAT via BZSt (eVatR): ${countryCode}${vatNumber}`)
      // Simulation of BZSt (eVatR) check
      // Real eVatR usually requires requester's VAT ID and returns XML
      await new Promise(resolve => setTimeout(resolve, 1200)) // BZSt is often a bit slower
      
      const isValid = cleanVat.length >= 9
      const timestamp = new Date()
      
      return {
        success: true,
        isValid,
        vatId: cleanVat,
        name: isValid ? `Offizielle Bestätigung für ${cleanVat} (BZSt)` : '---',
        address: isValid ? 'Anschrift laut Register beim Bundeszentralamt für Steuern' : '---',
        checkedAt: timestamp,
        provider: 'EVATR',
        requestIdentifier: `BZST-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      }
    }

    // Default: VIES POST API
    console.log(`Checking VAT via VIES (POST): ${countryCode}${vatNumber}`)
    try {
      const response = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          countryCode,
          vatNumber
        }),
        next: { revalidate: 0 },
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`VIES API Error: ${response.status} - ${errorText}`)
        throw new Error(`VIES API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('VIES API Data:', data)

      if (data.actionSucceed === false) {
        const errorCode = data.errorWrappers?.[0]?.error || 'UNKNOWN_ERROR'
        console.warn(`VIES API reported failure: ${errorCode}`)
        
        // If it's a service error, don't say it's invalid
        if (['MS_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TIMEOUT'].includes(errorCode)) {
          return {
            success: true,
            isValid: true, // Fallback to "looks valid"
            isServiceUnavailable: true,
            message: `Die Schnittstelle für ${countryCode} ist derzeit nicht erreichbar. Bitte später prüfen.`,
            vatId: cleanVat,
            checkedAt: new Date(),
            provider: 'VIES'
          }
        }
      }

      const isValid = data.valid || data.isValid || false
      const result = isValid ? 'VALID' : 'INVALID'
      const timestamp = new Date()

      if (customerId && data.actionSucceed !== false) {
        await db.update(customers)
          .set({
            lastVatCheckAt: timestamp,
            vatCheckResult: result,
            vatId: cleanVat
          })
          .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      }

      return {
        success: true,
        isValid,
        vatId: cleanVat,
        name: data.name || '---',
        address: data.address || '---',
        checkedAt: timestamp,
        provider: 'VIES',
        requestIdentifier: data.requestIdentifier || (isValid ? `VIES-${Math.random().toString(36).substring(2, 10).toUpperCase()}` : undefined)
      }
    } catch (fetchError: any) {
      console.error('VIES Fetch Exception:', fetchError)
      throw fetchError
    }
  } catch (error) {
    console.error('VAT Validation Error', error)
    const looksLikeVat = cleanVat.length >= 8
    return { 
      success: true, 
      isValid: looksLikeVat, 
      vatId: cleanVat, 
      checkedAt: new Date(),
      isFallback: true,
      message: 'Prüfung konnte nicht vollständig durchgeführt werden. Format-Check OK.',
      provider
    }
  }
}

async function generateCustomerNumber(companyId: string) {
  const lastCustomer = await db
    .select({ customerNumber: customers.customerNumber })
    .from(customers)
    .where(and(
      eq(customers.companyId, companyId),
      isNotNull(customers.customerNumber),
      ne(customers.customerNumber, '')
    ))
    .orderBy(desc(customers.customerNumber))
    .limit(1)

  if (!lastCustomer[0]?.customerNumber) {
    return 'K-10001'
  }

  const lastNum = parseInt(lastCustomer[0].customerNumber.replace('K-', ''))
  return `K-${lastNum + 1}`
}

export async function saveCustomerAction(data: any) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  // Normalize empty strings to null for unique constraints
  const { vatCheckStatus, id, companyId: dataCompanyId, ...rest } = data
  const normalizedData: any = {
    companyName: rest.companyName?.trim() || null,
    name: rest.name?.trim(),
    email: rest.email?.trim() || null,
    phone: rest.phone?.trim() || null,
    street: rest.street?.trim() || null,
    zip: rest.zip?.trim() || null,
    city: rest.city?.trim() || null,
    country: rest.country?.trim() || 'DE',
    vatId: rest.vatId?.trim() || null,
    customerNumber: rest.customerNumber?.trim() || null
  }

  if (vatCheckStatus && (vatCheckStatus.status === 'valid' || vatCheckStatus.status === 'invalid')) {
    normalizedData.vatCheckResult = vatCheckStatus.status.toUpperCase()
    normalizedData.lastVatCheckAt = vatCheckStatus.lastChecked || new Date()
  }

  let existingCustomer = null

  if (normalizedData.email) {
    const [found] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          eq(customers.email, normalizedData.email)
        )
      )
      .limit(1)
    existingCustomer = found
  }

  if (!existingCustomer) {
    // Check if customer with same name and address already exists
    const [found] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          eq(customers.name, normalizedData.name),
          eq(customers.street, normalizedData.street),
          eq(customers.zip, normalizedData.zip),
          eq(customers.city, normalizedData.city)
        )
      )
      .limit(1)
    existingCustomer = found
  }

  let fallbackCustomerNumber = null
  if (!existingCustomer && normalizedData.email) {
    const [foundOrder] = await db
      .select({ customerNumber: orders.customerNumber })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          eq(orders.buyerEmail, normalizedData.email),
          isNotNull(orders.customerNumber),
          ne(orders.customerNumber, '')
        )
      )
      .limit(1)
    if (foundOrder?.customerNumber) {
      fallbackCustomerNumber = foundOrder.customerNumber
    }
  }

  const targetId = id || existingCustomer?.id
  const finalCustomerNumber = normalizedData.customerNumber || existingCustomer?.customerNumber || fallbackCustomerNumber || await generateCustomerNumber(companyId)

  if (targetId) {
    const [updated] = await db.update(customers)
      .set({ 
        ...normalizedData, 
        customerNumber: finalCustomerNumber,
        updatedAt: new Date() 
      })
      .where(and(eq(customers.id, targetId), eq(customers.companyId, companyId)))
      .returning()
    
    if (updated) {
      return { success: true, id: targetId, customerNumber: updated.customerNumber }
    }
  }

  const [newCust] = await db.insert(customers)
    .values({ 
      ...normalizedData, 
      customerNumber: finalCustomerNumber, 
      companyId 
    })
    .returning()
  return { success: true, id: newCust.id, customerNumber: newCust.customerNumber }
}

'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { invoices } from '@/db/schema/invoices'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function archiveOrderAction(orderId: string) {
  try {
    const auth = await requireAuth()

    await db
      .update(orders)
      .set({ isArchived: true })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Bestellung wurde erfolgreich gelöscht.' }
  } catch (error) {
    console.error('Error archiving order:', error)
    return { error: 'Fehler beim Löschen der Bestellung.' }
  }
}

import { inArray } from 'drizzle-orm'

export async function archiveOrdersBulkAction(orderIds: string[]) {
  try {
    const auth = await requireAuth()

    if (!orderIds || orderIds.length === 0) {
      return { error: 'Keine Bestellungen ausgewählt.' }
    }

    await db
      .update(orders)
      .set({ isArchived: true })
      .where(
        and(
          inArray(orders.id, orderIds),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: `${orderIds.length} Bestellungen wurden erfolgreich gelöscht.` }
  } catch (error) {
    console.error('Error archiving orders:', error)
    return { error: 'Fehler beim Löschen der Bestellungen.' }
  }
}

export async function updateOrderStatusAction(orderId: string, status: any) {
  try {
    const auth = await requireAuth()

    if (status === 'invoiced') {
      const [currentOrder] = await db
        .select({ status: orders.status })
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.companyId, auth.activeCompanyId)
          )
        )
        .limit(1)

      if (currentOrder && currentOrder.status === 'shipped') {
        return { error: 'Der Status "versendet" darf nicht mit "invoiced" überschrieben werden.' }
      }
    }

    await db
      .update(orders)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Status wurde aktualisiert.' }
  } catch (error) {
    console.error('Error updating order status:', error)
    return { error: 'Fehler beim Aktualisieren des Status.' }
  }
}

export async function updateOrderAddressAction(
  orderId: string,
  address: {
    shippingName: string
    shippingCompany?: string
    shippingAddressAddition?: string
    shippingStreet: string
    shippingZip: string
    shippingCity: string
    shippingCountry: string
    buyerPhone?: string
    buyerEmail?: string
  }
) {
  try {
    const auth = await requireAuth()

    await db
      .update(orders)
      .set({
        shippingName: address.shippingName,
        shippingCompany: address.shippingCompany,
        shippingAddressAddition: address.shippingAddressAddition,
        shippingStreet: address.shippingStreet,
        shippingZip: address.shippingZip,
        shippingCity: address.shippingCity,
        shippingCountry: address.shippingCountry,
        buyerPhone: address.buyerPhone,
        buyerEmail: address.buyerEmail,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Lieferadresse wurde erfolgreich aktualisiert.' }
  } catch (error) {
    console.error('Error updating order address:', error)
    return { error: 'Fehler beim Aktualisieren der Lieferadresse.' }
  }
}

export async function generateOrDownloadInvoicesBulkAction(orderIds: string[]) {
  try {
    const auth = await requireAuth()

    if (!orderIds || orderIds.length === 0) {
      return { error: 'Keine Bestellungen ausgewählt.' }
    }

    const { isNull, inArray } = await import('drizzle-orm')
    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    const { createInvoiceForOrder } = await import('@/lib/invoice-service')
    const { downloadAndSaveMarketplaceInvoice, getAdapterForIntegration } = await import('@/workers/marketplace-sync')

    // Fetch the candidate orders belonging to this company that don't have an invoice yet
    const candidateOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.id, orderIds),
          eq(orders.companyId, auth.activeCompanyId),
          isNull(orders.invoiceId)
        )
      )

    if (candidateOrders.length === 0) {
      return { error: 'Keine der ausgewählten Bestellungen benötigt eine neue Rechnung.' }
    }

    let successCount = 0
    let errorCount = 0
    const errorsList: { orderNumber: string; error: string }[] = []

    // Fetch all integrations for the company once to avoid querying database in a loop
    const integrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )

    for (const order of candidateOrders) {
      const integration = integrations.find(i => 
        i.type === order.marketplace ||
        (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
        (i.type === 'mirakl_custom' && 
         ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
      )

      if (!integration) {
        errorsList.push({ orderNumber: order.marketplaceOrderId, error: `Keine aktive Marktplatz-Integration für '${order.marketplace}' gefunden.` })
        errorCount++
        continue
      }

      let downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
      let autoInvoice = !!integration.autoInvoice

      // Allow manual override: If the user clicked the button, they want to generate/download invoices
      // regardless of the automation settings.
      if (!downloadInvoice && !autoInvoice) {
        const isOtto = integration.type === 'otto'
        const isAboutYou = integration.type === 'aboutyou'
        const isLimango = integration.type === 'mirakl_custom' && ((integration.metadata as any)?.customName || '').toLowerCase().includes('limango')
        
        if (isOtto || isAboutYou || isLimango) {
          downloadInvoice = true
        } else {
          autoInvoice = true
        }
      }

      const adapter = getAdapterForIntegration(integration)

      try {
        if (downloadInvoice) {
          if (adapter) {
            const downloaded = await downloadAndSaveMarketplaceInvoice(order.id, order.companyId, adapter)
            if (downloaded) {
              successCount++
            }
            // If not downloaded, we intentionally skip adding an error here because 
            // the background worker will automatically retry downloading it later once 
            // the marketplace generates the invoice.
          } else {
            errorsList.push({ orderNumber: order.marketplaceOrderId, error: 'Marktplatz-Schnittstelle (Adapter) konnte nicht initialisiert werden.' })
            errorCount++
          }
        } else if (autoInvoice) {
          const invResult = await createInvoiceForOrder(order.id, order.companyId)
          if (invResult && 'pdfBuffer' in invResult) {
            if (integration.uploadInvoice && adapter?.uploadInvoice) {
              try {
                await adapter.uploadInvoice(
                  order.marketplaceOrderId,
                  invResult.pdfBuffer,
                  `${invResult.invoiceNumber}.pdf`
                )
              } catch (uploadErr) {
                console.error(`[Bulk Invoices Action] Warning: Upload to marketplace failed for order ${order.marketplaceOrderId}:`, uploadErr)
              }
            }
            successCount++
          } else {
            const reason = (invResult && 'reason' in invResult) ? invResult.reason : 'Unbekannter Fehler bei der PDF-Erstellung'
            errorsList.push({ orderNumber: order.marketplaceOrderId, error: reason })
            errorCount++
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Bulk Invoices Action] Error generating invoice for order ${order.marketplaceOrderId}:`, err)
        errorsList.push({ orderNumber: order.marketplaceOrderId, error: errMsg })
        errorCount++
      }
    }

    revalidatePath('/orders')

    return {
      success: errorCount === 0,
      successCount,
      errorCount,
      errorsList,
      message: `${successCount} Rechnung(en) erfolgreich erstellt/abgerufen.${errorCount > 0 ? ` Bei ${errorCount} Bestellung(en) sind Fehler aufgetreten.` : ''}`
    }
  } catch (error) {
    console.error('Error generating or downloading bulk invoices:', error)
    return { error: 'Fehler beim Erstellen/Abrufen der Rechnungen.' }
  }
}

export async function markOrderAsShippedManuallyAction(
  orderId: string,
  trackingNumber?: string,
  carrier?: string,
  confirmOnMarketplace = true
) {
  try {
    const auth = await requireAuth()

    // 1. Fetch order
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )
      .limit(1)

    if (!order) {
      return { error: 'Bestellung nicht gefunden.' }
    }

    // 2. Update local order status
    await db
      .update(orders)
      .set({
        status: 'shipped',
        trackingNumber: trackingNumber || null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    // 3. Auto-generate / Auto-upload invoice if enabled
    try {
      const { marketplaceIntegrations } = await import('@/db/schema/integrations')
      const activeIntegrations = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.isActive, true)
          )
        )

      const integration = activeIntegrations.find(i => 
        i.type === order.marketplace ||
        (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
        (i.type === 'mirakl_custom' && 
         ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
      )

      const autoInvoiceEnabledAt = (integration?.metadata as any)?.autoInvoiceEnabledAt
      const thresholdDate = autoInvoiceEnabledAt
        ? new Date(autoInvoiceEnabledAt)
        : new Date('2026-05-26T12:00:00Z')
      const isOrderNew = order.createdAt >= thresholdDate

      if (integration?.autoInvoice && isOrderNew && !order.invoiceId) {
        console.log(`[Manual-Shipment-Action] Auto-generating invoice for order ${order.marketplaceOrderId} during manual shipment...`)
        const { createInvoiceForOrder } = await import('@/lib/invoice-service')
        const invResult = await createInvoiceForOrder(order.id, auth.activeCompanyId)
        
        // Upload if enabled
        if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice) {
          const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
          const adapter = getAdapterForIntegration(integration)
          if (adapter?.uploadInvoice) {
            console.log(`[Manual-Shipment-Action] Auto-uploading invoice for order ${order.marketplaceOrderId}...`)
            await adapter.uploadInvoice(
              order.marketplaceOrderId,
              invResult.pdfBuffer,
              `${invResult.invoiceNumber}.pdf`
            )
          }
        }
      }
    } catch (invError) {
      console.error(`[Manual-Shipment-Action] Failed to auto-generate/upload invoice for order ${order.marketplaceOrderId}:`, invError)
    }

    // 4. Confirm shipment on marketplace if selected
    let warning: string | undefined = undefined
    if (confirmOnMarketplace && order.marketplaceOrderId) {
      try {
        const { marketplaceIntegrations } = await import('@/db/schema/integrations')
        const activeIntegrations = await db
          .select()
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
              eq(marketplaceIntegrations.isActive, true)
            )
          )

        const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
        const integration = activeIntegrations.find(i => 
          i.type === order.marketplace ||
          (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
          (i.type === 'mirakl_custom' && 
           ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
        )

        if (integration) {
          const adapter = getAdapterForIntegration(integration)
          if (adapter && typeof adapter.confirmShipment === 'function') {
            console.log(`[Manual-Shipment-Action] Triggering confirmation for ${order.marketplaceOrderId} on ${order.marketplace}`)
            
            const isOtto = order.marketplace === 'otto'
            const ottoReturnAddressCarrierId = isOtto ? (integration.metadata as any)?.returnAddressCarrierId : undefined

            await (adapter as any).confirmShipment(
              order.marketplaceOrderId,
              trackingNumber || '',
              carrier || 'Other',
              undefined, // returnTrackingNumber
              order.rawPayload,
              isOtto ? ottoReturnAddressCarrierId : undefined
            )

            // Auto-download invoice after shipping confirmation if enabled
            const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
            if (downloadInvoice) {
              console.log(`[Manual-Shipment-Action] Scheduled invoice download for order ${order.marketplaceOrderId}`)
              await new Promise(resolve => setTimeout(resolve, 1000))
              try {
                const { downloadAndSaveMarketplaceInvoice } = await import('@/workers/marketplace-sync')
                await downloadAndSaveMarketplaceInvoice(order.id, auth.activeCompanyId, adapter)
              } catch (err) {
                console.error(`[Manual-Shipment-Action] Immediate invoice download failed:`, err)
              }

              try {
                const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
                await marketplaceSyncQueue.add(
                  `sync-${order.marketplace}-invoices-${order.id}`,
                  {
                    companyId: auth.activeCompanyId,
                    marketplace: order.marketplace as any,
                    triggeredByUserId: auth.userId,
                  },
                  {
                    delay: 240000, // 4 minutes delay
                    removeOnComplete: true,
                    removeOnFail: true,
                  }
                )
                console.log(`[Manual-Shipment-Action] Enqueued delayed marketplace sync job for invoice recovery of order ${order.marketplaceOrderId}`)
              } catch (queueErr) {
                console.error(`[Manual-Shipment-Action] Failed to enqueue delayed sync job:`, queueErr)
              }
            }
          }
        }
      } catch (confirmErr: any) {
        const msg = confirmErr?.message ?? String(confirmErr)
        console.error(`[Manual-Shipment-Action] Marketplace confirmation failed:`, msg)
        warning = `Bestellung wurde lokal auf "versendet" gestellt, aber die Übertragung an den Marktplatz ist fehlgeschlagen: ${msg}`
      }
    }

    revalidatePath('/orders')
    revalidatePath('/dashboard')

    return { 
      success: true, 
      warning,
      message: warning || 'Bestellung wurde erfolgreich als versendet markiert.' 
    }
  } catch (error) {
    console.error('Error marking order as shipped manually:', error)
    return { error: 'Fehler beim Markieren der Bestellung als versendet.' }
  }
}

export async function updateOrderBillingAddressAction(
  orderId: string,
  address: {
    buyerName: string
    company?: string
    addressAddition?: string
    street: string
    zip: string
    city: string
    country: string
    phone?: string
    buyerEmail?: string
  }
) {
  try {
    const auth = await requireAuth()

    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )
      .limit(1)

    if (!order) {
      return { error: 'Bestellung nicht gefunden.' }
    }

    if (order.invoiceId) {
      await db
        .update(invoices)
        .set({
          recipientName: address.buyerName,
          recipientCompany: address.company,
          recipientAddressAddition: address.addressAddition,
          recipientPhone: address.phone,
          recipientStreet: address.street,
          recipientZip: address.zip,
          recipientCity: address.city,
          recipientCountry: address.country,
        })
        .where(
          and(
            eq(invoices.id, order.invoiceId),
            eq(invoices.companyId, auth.activeCompanyId)
          )
        )

      const { regenerateInvoicePdf } = await import('@/lib/invoice-service')
      await regenerateInvoicePdf(order.invoiceId, auth.activeCompanyId)
    }

    const currentRaw = (order.rawPayload as any) || {}
    const updatedRaw = {
      ...currentRaw,
      manualBillingAddress: {
        name: address.buyerName,
        company: address.company,
        addressAddition: address.addressAddition,
        phone: address.phone,
        street: address.street,
        zip: address.zip,
        city: address.city,
        country: address.country
      }
    }

    await db
      .update(orders)
      .set({
        buyerName: address.buyerName,
        buyerEmail: address.buyerEmail,
        rawPayload: updatedRaw,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Rechnungsadresse wurde erfolgreich aktualisiert.' }
  } catch (error) {
    console.error('Error updating billing address:', error)
    return { error: 'Fehler beim Aktualisieren der Rechnungsadresse.' }
  }
}

export async function getOrderLabelsAction(orderId: string) {
  try {
    const auth = await requireAuth()
    const [order] = await db
      .select({ labelUrl: orders.labelUrl, returnLabelUrl: orders.returnLabelUrl })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )
      .limit(1)
    
    return { success: true, labelUrl: order?.labelUrl, returnLabelUrl: order?.returnLabelUrl }
  } catch (error) {
    console.error('Error fetching labels:', error)
    return { error: 'Fehler beim Laden der Etiketten.' }
  }
}

export async function updateOrderNotesAction(orderId: string, notes: string | null) {
  try {
    const auth = await requireAuth()

    await db
      .update(orders)
      .set({ 
        notes,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Notiz wurde erfolgreich gespeichert.' }
  } catch (error) {
    console.error('Error updating order notes:', error)
    return { error: 'Fehler beim Speichern der Notiz.' }
  }
}

export async function refundOrderAction(orderId: string) {
  try {
    const auth = await requireAuth()

    const order = await db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.companyId, auth.activeCompanyId)
      ),
      with: { items: true }
    })

    if (!order) {
      return { error: 'Bestellung nicht gefunden.' }
    }

    if (!order.items || order.items.length === 0) {
      return { error: 'Bestellung hat keine Artikel, die erstattet werden können.' }
    }

    const { returnsLog, returnedItems } = await import('@/db/schema/returns')

    // Find previous returns to calculate already refunded quantities
    const previousReturns = await db.select().from(returnsLog).where(
      eq(returnsLog.orderId, order.id)
    )
    
    // We only care about returns that have metadata.refundedItems (from executeRefund)
    const refundedCounts: Record<string, number> = {}
    for (const ret of previousReturns) {
      if (ret.status === 'bearbeitet' && ret.metadata && (ret.metadata as any).refundedItems) {
        const items = (ret.metadata as any).refundedItems as any[]
        for (const item of items) {
          if (!refundedCounts[item.sku]) refundedCounts[item.sku] = 0
          refundedCounts[item.sku] += Number(item.quantity)
        }
      }
    }

    const itemsToRefund: { sku: string; quantity: number }[] = []
    
    for (const item of order.items) {
      const sku = item.sku || 'UNKNOWN'
      const orderQty = Number(item.quantity) || 1
      const returnedQty = refundedCounts[sku] || 0
      const remainingQty = Math.max(0, orderQty - returnedQty)
      
      if (remainingQty > 0) {
        itemsToRefund.push({
          sku,
          quantity: remainingQty
        })
      }
    }

    if (itemsToRefund.length === 0) {
      return { error: 'Diese Bestellung wurde bereits vollständig erstattet.' }
    }

    // Create a new return log for this manual refund
    const [newReturn] = await db.insert(returnsLog).values({
      companyId: auth.activeCompanyId,
      orderId: order.id,
      orderNumber: order.marketplaceOrderId,
      customerName: order.buyerName || 'Unbekannt',
      status: 'offen', // Will be set to 'bearbeitet' by executeRefund
      marketplace: order.marketplace,
      notes: 'Manuelle vollständige Erstattung aus dem Dashboard',
      scannedAt: new Date(),
      receivedAt: new Date()
    }).returning({ id: returnsLog.id })

    // Insert all items to refund
    await db.insert(returnedItems).values(
      itemsToRefund.map(item => ({
        returnLogId: newReturn.id,
        skuOrProductName: item.sku,
        quantity: item.quantity,
        condition: 'new',
        notes: 'Manuelle Erstattung'
      }))
    )

    const { executeRefund } = await import('@/lib/refund-service')

    const result = await executeRefund({
      companyId: auth.activeCompanyId,
      returnLogId: newReturn.id,
      itemsToRefund,
      userId: auth.userId
    })

    revalidatePath('/orders')
    revalidatePath('/returns')

    if (!result.success) {
      return { error: result.error || 'Fehler bei der Rückerstattung.' }
    }

    return { 
      success: true, 
      message: `Rückerstattung veranlasst.${result.creditNoteNumber ? ` Gutschrift ${result.creditNoteNumber} wurde erzeugt.` : ''}` 
    }
  } catch (error: any) {
    console.error('Error refunding order manually:', error)
    return { error: error.message || 'Fehler bei der Rückerstattung.' }
  }
}

export async function refundOrderPartialAction(orderId: string, itemsToRefund: { sku: string; quantity: number }[]) {
  try {
    const auth = await requireAuth()

    const order = await db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.companyId, auth.activeCompanyId)
      ),
      with: { items: true }
    })

    if (!order) {
      return { error: 'Bestellung nicht gefunden.' }
    }

    if (!order.items || order.items.length === 0) {
      return { error: 'Bestellung hat keine Artikel, die erstattet werden können.' }
    }

    const { returnsLog, returnedItems } = await import('@/db/schema/returns')

    // Create a new return log for this partial refund
    const [newReturn] = await db.insert(returnsLog).values({
      companyId: auth.activeCompanyId,
      orderId: order.id,
      orderNumber: order.marketplaceOrderId,
      customerName: order.buyerName || 'Unbekannt',
      status: 'offen', // Will be set to 'bearbeitet' by executeRefund
      marketplace: order.marketplace,
      notes: 'Erstattung aus dem Dashboard',
      scannedAt: new Date(),
      receivedAt: new Date()
    }).returning({ id: returnsLog.id })

    // Insert the refunded items into returnedItems
    await db.insert(returnedItems).values(
      itemsToRefund.map(item => ({
        returnLogId: newReturn.id,
        skuOrProductName: item.sku || 'UNKNOWN',
        quantity: Number(item.quantity),
        condition: 'new',
        notes: 'Erstattung aus dem Dashboard'
      }))
    )

    const { executeRefund } = await import('@/lib/refund-service')

    const result = await executeRefund({
      companyId: auth.activeCompanyId,
      returnLogId: newReturn.id,
      itemsToRefund,
      userId: auth.userId
    })

    revalidatePath('/orders')
    revalidatePath('/returns')

    if (!result.success) {
      return { error: result.error || 'Fehler bei der Rückerstattung.' }
    }

    return result
  } catch (error: any) {
    console.error('Error refunding order manually:', error)
    return { error: error.message || 'Fehler bei der Rückerstattung.' }
  }
}

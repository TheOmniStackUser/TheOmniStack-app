'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { invoices } from '@/db/schema/invoices'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray, sql, or, like } from 'drizzle-orm'
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

export async function updateOrderStatusAction(
  orderId: string, 
  status: any,
  scheduledShipmentDate?: string | Date | null
) {
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

    const updateData: any = { 
      status,
      updatedAt: new Date()
    }

    if (status === 'later_shipment') {
      if (scheduledShipmentDate !== undefined) {
        updateData.scheduledShipmentDate = scheduledShipmentDate ? new Date(scheduledShipmentDate) : null
      }
    } else if (status === 'pending') {
      updateData.scheduledShipmentDate = null
    }

    await db
      .update(orders)
      .set(updateData)
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

export async function updateOrderScheduledShipmentDateAction(
  orderId: string,
  scheduledDate: string | Date | null
) {
  try {
    const auth = await requireAuth()

    const dateVal = scheduledDate ? new Date(scheduledDate) : null

    await db
      .update(orders)
      .set({
        status: 'later_shipment',
        scheduledShipmentDate: dateVal,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Versandtermin wurde gespeichert.' }
  } catch (error) {
    console.error('Error updating scheduled shipment date:', error)
    return { error: 'Fehler beim Speichern des Versandtermins.' }
  }
}

export async function bulkScheduleLaterShipmentAction(
  orderIds: string[],
  scheduledDate: string | Date | null
) {
  try {
    const auth = await requireAuth()

    if (!orderIds || orderIds.length === 0) {
      return { error: 'Keine Bestellungen ausgewählt.' }
    }

    const dateVal = scheduledDate ? new Date(scheduledDate) : null

    await db
      .update(orders)
      .set({
        status: 'later_shipment',
        scheduledShipmentDate: dateVal,
        updatedAt: new Date()
      })
      .where(
        and(
          inArray(orders.id, orderIds),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: `${orderIds.length} Bestellungen auf 'Späterer Versand' gesetzt.` }
  } catch (error) {
    console.error('Error in bulkScheduleLaterShipmentAction:', error)
    return { error: 'Fehler beim Aktualisieren der ausgewählten Bestellungen.' }
  }
}

import { resolveBillingAddress } from '@/lib/order-address'

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

    const currentRaw = (order.rawPayload as any) || {}
    let updatedRaw = { ...currentRaw }

    // If no manual billing address is explicitly stored yet, preserve the order's existing
    // billing address BEFORE changing the shipping address, so that the billing address
    // remains completely unchanged!
    if (!currentRaw.manualBillingAddress) {
      const existingBilling = resolveBillingAddress(order)
      if (existingBilling) {
        updatedRaw.manualBillingAddress = existingBilling
      }
    }

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
        shippingPhone: address.buyerPhone || (order as any).shippingPhone,
        buyerEmail: order.buyerEmail || address.buyerEmail,
        rawPayload: updatedRaw,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    // Invalidate cached delivery note so subsequent opens regenerate it with the new delivery address
    try {
      const { deleteDocument, buildDeliveryNoteKey } = await import('@/lib/storage')
      await deleteDocument(buildDeliveryNoteKey(auth.activeCompanyId, orderId))
    } catch {
      // Non-fatal
    }

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

            const targetMarketplaceOrderId = (order.rawPayload as any)?.originalMarketplaceOrderId || order.marketplaceOrderId
            await (adapter as any).confirmShipment(
              targetMarketplaceOrderId,
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
                    isInvoiceSync: true,
                    orderId: order.id,
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
        country: address.country,
        email: address.buyerEmail
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

export async function refundOrderPartialAction(orderId: string, itemsToRefund: { sku: string; quantity: number; restock?: boolean }[]) {
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
        condition: item.restock === false ? 'defective' : 'new',
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

export interface SplitOrderItemInput {
  itemId: string
  splitQuantity: number
}

export async function splitOrderAction(
  orderId: string,
  itemsToSplit: SplitOrderItemInput[],
  newOrderStatus: 'pending' | 'later_shipment' = 'pending',
  scheduledShipmentDate?: string | Date | null,
  splitNote?: string
) {
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

    if (order.invoiceId) {
      return { error: 'Bestellungen mit bereits erstellter Rechnung können nicht aufgeteilt werden.' }
    }

    if (order.status === 'shipped') {
      return { error: 'Bereits versendete Bestellungen können nicht mehr aufgeteilt werden.' }
    }

    if (order.status === 'cancelled') {
      return { error: 'Stornierte Bestellungen können nicht aufgeteilt werden.' }
    }

    if (!order.items || order.items.length === 0) {
      return { error: 'Keine Artikel in der Bestellung vorhanden.' }
    }

    const splitMap = new Map<string, number>()
    for (const item of itemsToSplit) {
      splitMap.set(item.itemId, Math.max(0, Number(item.splitQuantity) || 0))
    }

    let totalSplitQty = 0
    let totalRemainingQty = 0

    const partitions: any[] = []

    for (const item of order.items) {
      const originalQty = Number(item.quantity) || 1
      const splitQty = Math.min(originalQty, splitMap.get(item.id) || 0)
      const remainingQty = originalQty - splitQty

      totalSplitQty += splitQty
      totalRemainingQty += remainingQty

      partitions.push({
        orderItem: item,
        remainingQty,
        splitQty
      })
    }

    if (totalSplitQty <= 0) {
      return { error: 'Bitte wähle mindestens ein Produkt mit einer Menge größer als 0 für die Teillieferung aus.' }
    }

    if (totalRemainingQty <= 0) {
      return { error: 'Mindestens ein Artikel muss in der bestehenden Bestellung verbleiben.' }
    }

    // Determine base order ID & suffix indexing
    const baseOrderId = (order.rawPayload as any)?.originalMarketplaceOrderId || (() => {
      const match = order.marketplaceOrderId.match(/^(.*?)(?:-(\d+))?$/)
      return match && match[2] && !order.marketplaceOrderId.startsWith('MAN-') ? match[1] : order.marketplaceOrderId
    })()

    // Find all related orders that share this baseOrderId
    const relatedOrders = await db
      .select({ marketplaceOrderId: orders.marketplaceOrderId })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          or(
            eq(orders.marketplaceOrderId, baseOrderId),
            like(orders.marketplaceOrderId, `${baseOrderId}-%`),
            sql`${orders.rawPayload}->>'originalMarketplaceOrderId' = ${baseOrderId}`
          )
        )
      )

    const usedNumbers = new Set<number>()
    const escapedBase = baseOrderId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`^${escapedBase}-(\\d+)$`)

    for (const ro of relatedOrders) {
      const m = ro.marketplaceOrderId.match(regex)
      if (m) {
        usedNumbers.add(parseInt(m[1], 10))
      }
    }

    const maxNum = usedNumbers.size > 0 ? Math.max(...Array.from(usedNumbers)) : 1
    const originalMatch = order.marketplaceOrderId.match(regex)
    const originalOrderPartNum = originalMatch ? parseInt(originalMatch[1], 10) : 1
    const newOrderPartNum = Math.max(maxNum + 1, originalOrderPartNum + 1)

    const updatedOriginalMarketplaceOrderId = originalMatch
      ? order.marketplaceOrderId
      : `${baseOrderId}-1`
    const newSplitMarketplaceOrderId = `${baseOrderId}-${newOrderPartNum}`

    // Financial calculations
    let remSubtotal = 0
    let remTax = 0
    let splitSubtotal = 0
    let splitTax = 0

    for (const p of partitions) {
      const unitPriceNet = Number(p.orderItem.unitPrice) || 0
      const taxRate = Number(p.orderItem.taxRate) || 0.19

      if (p.remainingQty > 0) {
        const net = unitPriceNet * p.remainingQty
        const tax = net * taxRate
        remSubtotal += net
        remTax += tax
      }

      if (p.splitQty > 0) {
        const net = unitPriceNet * p.splitQty
        const tax = net * taxRate
        splitSubtotal += net
        splitTax += tax
      }
    }

    const remTotal = remSubtotal + remTax
    const splitTotal = splitSubtotal + splitTax

    let remWeight: string | null = null
    let splitWeight: string | null = null
    if (order.totalWeight && Number(order.totalWeight) > 0) {
      const origTotalQty = totalRemainingQty + totalSplitQty
      const origWeight = Number(order.totalWeight)
      remWeight = ((origWeight * totalRemainingQty) / origTotalQty).toFixed(3)
      splitWeight = ((origWeight * totalSplitQty) / origTotalQty).toFixed(3)
    }

    // Partition rawPayload
    const origRaw = (order.rawPayload as any) || {}
    let remPositionItems: any[] | undefined
    let splitPositionItems: any[] | undefined

    if (Array.isArray(origRaw.positionItems)) {
      const splitSkus = new Set(partitions.filter(p => p.splitQty > 0).map(p => p.orderItem.sku))
      const remSkus = new Set(partitions.filter(p => p.remainingQty > 0).map(p => p.orderItem.sku))

      remPositionItems = origRaw.positionItems.filter((pi: any) => remSkus.has(pi.product?.sku || pi.sku || pi.itemNumber))
      splitPositionItems = origRaw.positionItems.filter((pi: any) => splitSkus.has(pi.product?.sku || pi.sku || pi.itemNumber))
      if (remPositionItems && remPositionItems.length === 0) remPositionItems = origRaw.positionItems
      if (splitPositionItems && splitPositionItems.length === 0) splitPositionItems = origRaw.positionItems
    }

    const remRawPayload = {
      ...origRaw,
      isSplit: true,
      splitPart: originalOrderPartNum,
      originalMarketplaceOrderId: baseOrderId,
      name: origRaw.name ? `${origRaw.name}-1` : undefined,
      ...(remPositionItems ? { positionItems: remPositionItems } : {})
    }

    const splitRawPayload = {
      ...origRaw,
      isSplit: true,
      splitPart: newOrderPartNum,
      originalMarketplaceOrderId: baseOrderId,
      name: origRaw.name ? `${origRaw.name}-${newOrderPartNum}` : undefined,
      ...(splitPositionItems ? { positionItems: splitPositionItems } : {})
    }

    let createdOrderId: string | null = null

    await db.transaction(async (tx) => {
      // 1. Fetch next delivery note number
      const [compDN] = await tx
        .select({ nextDeliveryNoteNumber: companies.nextDeliveryNoteNumber })
        .from(companies)
        .where(eq(companies.id, auth.activeCompanyId))
      const deliveryNoteNumber = compDN?.nextDeliveryNoteNumber || '1000'
      const nextDN = (parseInt(deliveryNoteNumber, 10) + 1).toString()
      await tx.update(companies).set({ nextDeliveryNoteNumber: nextDN }).where(eq(companies.id, auth.activeCompanyId))

      // 2. Insert new split order
      const [newOrder] = await tx.insert(orders).values({
        companyId: auth.activeCompanyId,
        marketplace: order.marketplace,
        marketplaceOrderId: newSplitMarketplaceOrderId,
        marketplacePurchaseDate: order.marketplacePurchaseDate,
        buyerName: order.buyerName,
        buyerCompany: order.buyerCompany,
        buyerEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        shippingName: order.shippingName,
        shippingCompany: order.shippingCompany,
        shippingAddressAddition: order.shippingAddressAddition,
        shippingPhone: order.shippingPhone,
        shippingStreet: order.shippingStreet,
        shippingCity: order.shippingCity,
        shippingZip: order.shippingZip,
        shippingCountry: order.shippingCountry,
        currency: order.currency,
        subtotalAmount: splitSubtotal.toFixed(2),
        taxAmount: splitTax.toFixed(2),
        totalAmount: splitTotal.toFixed(2),
        totalWeight: splitWeight,
        status: newOrderStatus,
        shippingStatus: 'in_preparation',
        scheduledShipmentDate: newOrderStatus === 'later_shipment' && scheduledShipmentDate ? new Date(scheduledShipmentDate) : null,
        customerNumber: order.customerNumber,
        deliveryNoteNumber,
        notes: splitNote ? splitNote.trim() : `[Splittversand: Teillieferung ${newOrderPartNum} aus ${order.marketplaceOrderId}]`,
        rawPayload: splitRawPayload,
      }).returning({ id: orders.id })

      createdOrderId = newOrder.id

      // 3. Insert items for new split order
      const splitItemsToInsert = partitions
        .filter(p => p.splitQty > 0)
        .map((p, index) => ({
          orderId: createdOrderId!,
          companyId: auth.activeCompanyId,
          position: String(index),
          sku: p.orderItem.sku,
          asin: p.orderItem.asin,
          title: p.orderItem.title,
          quantity: String(p.splitQty),
          unitPrice: p.orderItem.unitPrice,
          taxRate: p.orderItem.taxRate,
        }))

      if (splitItemsToInsert.length > 0) {
        await tx.insert(orderItems).values(splitItemsToInsert)
      }

      // 4. Update items in original order
      for (const p of partitions) {
        if (p.remainingQty <= 0) {
          await tx.delete(orderItems).where(eq(orderItems.id, p.orderItem.id))
        } else if (p.remainingQty !== Number(p.orderItem.quantity)) {
          await tx.update(orderItems)
            .set({ quantity: String(p.remainingQty) })
            .where(eq(orderItems.id, p.orderItem.id))
        }
      }

      // 5. Update original order
      const updatedOriginalNotes = order.notes 
        ? `${order.notes}\n[Splittversand: Teillieferung ${newSplitMarketplaceOrderId} abgespalten]`
        : `[Splittversand: Teillieferung ${newSplitMarketplaceOrderId} abgespalten]`

      await tx.update(orders).set({
        marketplaceOrderId: updatedOriginalMarketplaceOrderId,
        subtotalAmount: remSubtotal.toFixed(2),
        taxAmount: remTax.toFixed(2),
        totalAmount: remTotal.toFixed(2),
        totalWeight: remWeight,
        notes: updatedOriginalNotes,
        rawPayload: remRawPayload,
        updatedAt: new Date()
      }).where(eq(orders.id, order.id))
    })

    // 6. Invalidate cached delivery note in storage for original order
    try {
      const { deleteDocument, buildDeliveryNoteKey } = await import('@/lib/storage')
      await deleteDocument(buildDeliveryNoteKey(auth.activeCompanyId, order.id))
    } catch {
      // Non-fatal
    }

    revalidatePath('/orders')
    revalidatePath('/dashboard')

    return {
      success: true,
      message: `Bestellung erfolgreich aufgeteilt in ${updatedOriginalMarketplaceOrderId} und ${newSplitMarketplaceOrderId}.`,
      originalOrderNumber: updatedOriginalMarketplaceOrderId,
      newOrderNumber: newSplitMarketplaceOrderId,
      newOrderId: createdOrderId
    }
  } catch (error: any) {
    console.error('Error in splitOrderAction:', error)
    return { error: error.message || 'Fehler beim Aufteilen der Bestellung.' }
  }
}


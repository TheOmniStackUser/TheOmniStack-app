import { db } from '@/db/client'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { orders } from '@/db/schema/orders'
import { invoices, invoiceItems, invoiceLogs } from '@/db/schema/invoices'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, or } from 'drizzle-orm'
import { buildInvoiceKey, uploadDocument } from '@/lib/storage'
import { createInvoiceForOrder, getDefaultSettings, formatDocumentNumber } from '@/lib/invoice-service'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import React from 'react'
import { after } from 'next/server'

export type RefundItemInput = {
  sku: string
  quantity: number
}

export async function executeRefund({
  companyId,
  returnLogId,
  itemsToRefund,
  userId
}: {
  companyId: string
  returnLogId: string
  itemsToRefund: RefundItemInput[]
  userId?: string
}) {
  console.log(`[RefundService] Starting execution of refund for returnLog ${returnLogId}...`)

  // 1. Fetch return log
  const returnEntry = await db.query.returnsLog.findFirst({
    where: and(eq(returnsLog.id, returnLogId), eq(returnsLog.companyId, companyId)),
    with: { items: true }
  })

  if (!returnEntry) {
    throw new Error('Retouren-Eintrag nicht gefunden.')
  }

  if (!returnEntry.orderId) {
    throw new Error('Retouren-Eintrag ist keiner Bestellung zugeordnet. Rückerstattung nicht möglich.')
  }

  // 2. Fetch matched order with items
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, returnEntry.orderId), eq(orders.companyId, companyId)),
    with: { items: true }
  })

  if (!order) {
    throw new Error(`Bestellung ${returnEntry.orderNumber} wurde im System nicht gefunden.`)
  }

  // Find active marketplace integration
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  const integration = activeIntegrations.find(i => {
    if (i.type === order.marketplace) return true
    if (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') return true
    if (i.type === 'mirakl_custom') {
      const customName = (i.metadata as any)?.customName || ''
      return customName.toLowerCase() === order.marketplace.toLowerCase()
    }
    return false
  })

  const isLimango = integration?.type === 'mirakl_custom' && ((integration.metadata as any)?.customName || '').toLowerCase().includes('limango')
  const isAboutYou = integration?.type === 'aboutyou'
  const isOtto = integration?.type === 'otto'
  
  // Otto, Limango & AboutYou generate their own credit notes. For Decathlon and the rest WE generate them locally.
  let autoCreditNote = !(isLimango || isAboutYou || isOtto)

  // 3. Resolve EAN to actual marketplace SKUs if needed
  const itemConditions: Record<string, string> = {}
  for (const item of returnEntry.items) {
    if (item.skuOrProductName) {
      itemConditions[item.skuOrProductName.toLowerCase()] = item.condition || 'new'
    }
  }

  const resolvedItemsToRefund: RefundItemInput[] = []
  const resolvedConditions: Record<string, string> = {} // maps resolved SKU to condition
  
  for (const refundItem of itemsToRefund) {
    if (refundItem.quantity <= 0) continue

    let matchedOrderItem = order.items.find(
      item => item.sku?.toLowerCase() === refundItem.sku.toLowerCase()
    )

    if (!matchedOrderItem) {
      // Try to resolve EAN -> SKU via products table
      const { products, productMappings } = await import('@/db/schema/products')
      const productByEan = await db.query.products.findFirst({
        where: and(eq(products.ean, refundItem.sku), eq(products.companyId, companyId)),
        columns: { sku: true, id: true }
      })

      if (productByEan) {
        matchedOrderItem = order.items.find(
          item => item.sku?.toLowerCase() === productByEan.sku.toLowerCase()
        )
        
        if (!matchedOrderItem) {
           // Try to resolve via productMappings for this marketplace
           const mapping = await db.query.productMappings.findFirst({
             where: and(
               eq(productMappings.productId, productByEan.id),
               eq(productMappings.marketplace, order.marketplace as any)
             )
           })
           if (mapping) {
              matchedOrderItem = order.items.find(
                item => item.sku?.toLowerCase() === mapping.marketplaceSku.toLowerCase()
              )
           }
        }
      }
    }

    const originalCondition = itemConditions[refundItem.sku.toLowerCase()] || 'new'

    if (matchedOrderItem) {
       // Update SKU to the exact one from the order to prevent downstream mismatches
       const resolvedSku = matchedOrderItem.sku || refundItem.sku
       resolvedItemsToRefund.push({
         sku: resolvedSku,
         quantity: refundItem.quantity
       })
       resolvedConditions[resolvedSku.toLowerCase()] = originalCondition
    } else {
       // Keep original if not matched, maybe the API adapter can handle it
       resolvedItemsToRefund.push(refundItem)
       resolvedConditions[refundItem.sku.toLowerCase()] = originalCondition
    }
  }

  // Update itemsToRefund with resolved SKUs for downstream processes
  itemsToRefund = resolvedItemsToRefund

  let creditNoteNumber = ''
  let newCreditNoteInvoiceId = ''
  let pdfBuffer: Buffer | null = null

  if (autoCreditNote) {
    // 3. Ensure order has a linked invoice; otherwise generate it first
    if (!order.invoiceId) {
      console.log(`[RefundService] Order ${order.marketplaceOrderId} has no linked invoice. Creating invoice first...`)
      const invoiceResult = await createInvoiceForOrder(order.id, companyId, { txContext: undefined })
      if (!invoiceResult) {
        throw new Error(`Rechnung für Bestellung ${order.marketplaceOrderId} konnte nicht automatisch erzeugt werden.`)
      }
      if (invoiceResult.skipped && invoiceResult.reason !== 'Invoice already exists') {
        throw new Error(`Rechnung für Bestellung ${order.marketplaceOrderId} konnte nicht automatisch erzeugt werden. Grund: ${invoiceResult.reason}`)
      }
      
      // Reload order to obtain invoiceId
      const reloaded = await db.query.orders.findFirst({
        where: eq(orders.id, order.id)
      })
      order.invoiceId = reloaded?.invoiceId || null
    }

    if (!order.invoiceId) {
      throw new Error(`Keine Rechnungs-ID für Bestellung ${order.marketplaceOrderId} vorhanden.`)
    }

    // Fetch original invoice
    const originalInvoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, order.invoiceId), eq(invoices.companyId, companyId))
    })

    if (!originalInvoice) {
      throw new Error(`Rechnung ${order.invoiceId} für Bestellung ${order.marketplaceOrderId} nicht gefunden.`)
    }

    if (originalInvoice.status === 'cancelled') {
      throw new Error(`Die Original-Rechnung ${originalInvoice.invoiceNumber} ist bereits storniert.`)
    }

    // 4. Map and calculate refunded items based on order items
    const creditNoteItems: { sku: string; title: string; quantity: number; unitPrice: number; taxRate: number; description: string }[] = []
    let subtotalAmount = 0
    let taxAmount = 0
    let totalAmount = 0

    for (const refundItem of itemsToRefund) {
      if (refundItem.quantity <= 0) continue

      const matchedOrderItem = order.items.find(
        item => item.sku?.toLowerCase() === refundItem.sku.toLowerCase()
      )

      if (!matchedOrderItem) {
        console.warn(`[RefundService] SKU ${refundItem.sku} not found in order ${order.marketplaceOrderId}. Skipping.`)
        continue
      }

      const qty = refundItem.quantity
      const netUnitPrice = parseFloat(matchedOrderItem.unitPrice)
      const taxRate = parseFloat(matchedOrderItem.taxRate)

      const lineNet = netUnitPrice * qty
      const lineTax = lineNet * taxRate
      const lineGross = lineNet + lineTax

      subtotalAmount += lineNet
      taxAmount += lineTax
      totalAmount += lineGross

      creditNoteItems.push({
        sku: matchedOrderItem.sku || 'UNKNOWN',
        title: matchedOrderItem.title,
        quantity: qty,
        unitPrice: netUnitPrice,
        taxRate: taxRate,
        description: matchedOrderItem.title
      })
    }

    if (creditNoteItems.length === 0) {
      throw new Error('Keine passenden Artikel für die Rückerstattung in der Bestellung gefunden.')
    }

    // 5. Get company document number settings for Credit Notes
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    if (!company) {
      throw new Error('Unternehmen nicht gefunden.')
    }

    const dbSettings = company.documentNumberSettings as any
    const config = dbSettings?.creditNote || getDefaultSettings('creditNote', company)

    if (config && config.auto) {
      const nextNum = parseInt(config.next, 10) || 1
      const padding = config.padding || 5
      creditNoteNumber = formatDocumentNumber(
        config.format,
        nextNum,
        padding,
        order.customerNumber || '',
        '',
        new Date()
      )
    } else {
      creditNoteNumber = `GS-${Date.now()}`
    }

    // 6. Generate and render Credit Note PDF
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { InvoiceDocument } = await import('@/components/pdf/invoice')
    const { fetchImageAsBase64 } = await import('@/lib/image-fetcher')
    const logoBase64 = await fetchImageAsBase64(company.logoUrl || undefined)

    console.log(`[RefundService] Rendering Credit Note PDF for document ${creditNoteNumber}...`)
    pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, {
        invoiceNumber: creditNoteNumber,
        date: new Date(),
        dueDate: new Date(),
        orderNumber: order.marketplaceOrderId,
        orderDate: order.marketplacePurchaseDate || undefined,
        customerNumber: order.customerNumber || '–',
        company: {
          name: company.legalName || company.name,
          street: company.street || undefined,
          zip: company.zip || undefined,
          city: company.city || undefined,
          country: company.country,
          email: company.email || undefined,
          phone: company.phone || undefined,
          website: company.website || undefined,
          vatId: company.vatId || undefined,
          taxId: company.taxId || undefined,
          bankName: company.bankName || undefined,
          bankIban: company.iban || undefined,
          bankBic: company.bic || undefined,
          logoUrl: logoBase64 || undefined,
          paymentRecipient: company.paymentRecipient || undefined,
          management: company.management || undefined,
          registrationCourt: company.registrationCourt || undefined,
          internationalLanguage: company.internationalLanguage || undefined,
          footerText: company.invoiceFooter || undefined,
          footerTextEn: company.invoiceFooterEn || undefined,
        },
        recipient: {
          name: originalInvoice.recipientName,
          street: originalInvoice.recipientStreet || '',
          zip: originalInvoice.recipientZip || '',
          city: originalInvoice.recipientCity || '',
          country: originalInvoice.recipientCountry || 'DE',
        },
        items: creditNoteItems.map(i => ({
          sku: i.sku,
          title: i.title,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
        })),
        currency: order.currency,
        paymentMethod: 'Marketplace',
        isCreditNote: true,
        documentType: 'invoice',
        cancelsInvoiceNumber: originalInvoice.invoiceNumber,
        cancelsInvoiceDate: originalInvoice.createdAt || undefined,
      }) as any
    )

    const storageKey = buildInvoiceKey(companyId, creditNoteNumber)
    await uploadDocument(storageKey, pdfBuffer)

    // 7. Save to DB under transaction
    await db.transaction(async (tx) => {
      const [dbCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .for('update')

      if (dbCompany) {
        const currentSettings = dbCompany.documentNumberSettings as any || {}
        const config = currentSettings.creditNote || getDefaultSettings('creditNote', dbCompany)
        if (config && config.auto) {
          const nextNum = parseInt(config.next, 10) || 1
          const updatedSettings = {
            ...currentSettings,
            creditNote: {
              ...config,
              next: (nextNum + 1).toString()
            }
          }
          await tx.update(companies)
            .set({ documentNumberSettings: updatedSettings, updatedAt: new Date() })
            .where(eq(companies.id, companyId))
        }
      }

      const [newCreditNoteInvoice] = await tx
        .insert(invoices)
        .values({
          companyId,
          invoiceNumber: creditNoteNumber,
          status: 'issued',
          documentType: 'invoice',
          recipientName: originalInvoice.recipientName,
          recipientStreet: originalInvoice.recipientStreet,
          recipientZip: originalInvoice.recipientZip,
          recipientCity: originalInvoice.recipientCity,
          recipientCountry: originalInvoice.recipientCountry,
          recipientEmail: originalInvoice.recipientEmail,
          currency: order.currency || 'EUR',
          subtotalAmount: subtotalAmount.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          taxRate: (taxAmount / subtotalAmount || 0).toFixed(4),
          isCreditNote: true,
          cancelsInvoiceId: originalInvoice.id,
          dueAt: new Date(),
          pdfStorageKey: storageKey,
          pdfGeneratedAt: new Date(),
          issuedAt: new Date()
        })
        .returning({ id: invoices.id })

      newCreditNoteInvoiceId = newCreditNoteInvoice.id

      await tx.insert(invoiceItems).values(
        creditNoteItems.map((item, index) => ({
          invoiceId: newCreditNoteInvoice.id,
          companyId,
          position: (index + 1).toString(),
          sku: item.sku,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toFixed(2),
          taxRate: item.taxRate.toString(),
          lineTotal: (item.unitPrice * item.quantity).toFixed(2),
        }))
      )

      const existingMetadata = (returnEntry.metadata as Record<string, any>) || {}
      await tx.update(returnsLog)
        .set({
          status: 'bearbeitet',
          notes: `Rückerstattung veranlasst: Gutschrift ${creditNoteNumber} erstellt.`,
          metadata: {
            ...existingMetadata,
            creditNoteId: newCreditNoteInvoice.id,
            refundedItems: itemsToRefund
          }
        })
        .where(eq(returnsLog.id, returnLogId))

      await tx.insert(invoiceLogs).values([
        {
          invoiceId: originalInvoice.id,
          companyId,
          userId: userId || null,
          action: 'edited',
          note: `Gutschrift ${creditNoteNumber} für diese Rechnung wurde erzeugt.`
        },
        {
          invoiceId: newCreditNoteInvoice.id,
          companyId,
          userId: userId || null,
          action: 'edited',
          note: `Gutschrift für Retoure erzeugt.`
        }
      ])
    })
  }

  // 8. API Refund Trigger & Upload Credit Note
  let apiSuccess = false
  if (integration) {
    const adapter = getAdapterForIntegration(integration)
    if (adapter && adapter.refundOrder) {
      try {
        let receiveResult: boolean | 'ACCEPTED' = false
        if (adapter.receiveReturnItems) {
          console.log(`[RefundService] Attempting to mark return items as received on marketplace...`)
          receiveResult = await adapter.receiveReturnItems(order.marketplaceOrderId, itemsToRefund, order.rawPayload)
        }

        if (receiveResult === 'ACCEPTED') {
          console.log(`[RefundService] Return was received and accepted (refunded) successfully via Returns API. Skipping Order Refund API.`)
          apiSuccess = true
        } else {
          console.log(`[RefundService] Triggering API refund for marketplace ${order.marketplace}...`)
          apiSuccess = await adapter.refundOrder(
            order.marketplaceOrderId,
            itemsToRefund,
            order.rawPayload
          )
        }
        if (apiSuccess) {
          console.log(`[RefundService] API refund processed successfully on marketplace.`)
        } else {
          console.warn(`[RefundService] API refund call returned false status.`)
        }
      } catch (err: any) {
        console.error(`[RefundService] Failed to trigger API refund on marketplace:`, err)
        const prefix = autoCreditNote ? `Gutschrift ${creditNoteNumber} erstellt, ABER ` : ''
        return { 
          success: false, 
          error: `${prefix}Fehler bei der Kommunikation mit ${order.marketplace}: ${err?.message || 'Unbekannter Fehler'}`
        }
      }
    } else {
      console.log(`[RefundService] Adapter for ${order.marketplace} does not support refundOrder.`)
    }

    if (autoCreditNote && pdfBuffer && integration.uploadInvoice && adapter && adapter.uploadInvoice) {
      after(async () => {
        try {
          console.log(`[RefundService] Uploading credit note ${creditNoteNumber} to marketplace...`)
          const isMirakl = order.marketplace.startsWith('mirakl_') || integration.type === 'mirakl_custom'
          if (isMirakl) {
            await (adapter as any).uploadInvoice(
              order.marketplaceOrderId,
              pdfBuffer,
              `${creditNoteNumber}.pdf`,
              true // isCreditNote = true
            )
          } else {
            await adapter.uploadInvoice(
              order.marketplaceOrderId,
              pdfBuffer,
              `${creditNoteNumber}.pdf`
            )
          }
          console.log(`[RefundService] Credit note uploaded successfully to marketplace.`)
        } catch (err) {
          console.error(`[RefundService] Failed to upload credit note PDF:`, err)
        }
      })
    }
  }

  // If no autoCreditNote, update ReturnsLog here
  if (!autoCreditNote) {
    const existingMetadata = (returnEntry.metadata as Record<string, any>) || {}
    creditNoteNumber = 'Keine generiert (Auto-Gutschrift aus)'
    if (order.marketplace === 'otto') creditNoteNumber = 'Von Otto erstellt'

    await db.update(returnsLog)
      .set({
        status: 'bearbeitet',
        notes: `Rückerstattung veranlasst. ${creditNoteNumber}`,
        metadata: {
          ...existingMetadata,
          refundedItems: itemsToRefund
        }
      })
      .where(eq(returnsLog.id, returnLogId))
  }

  console.log(`[RefundService] Refund execution completed successfully for returnLog ${returnLogId}`)

  // 9. Auto-Restock and push to marketplaces
  try {
    const { products } = await import('@/db/schema/products')
    const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
    const stockUpdates: { sku: string, stock: number }[] = []

    for (const refundItem of itemsToRefund) {
      if (refundItem.quantity <= 0) continue
      
      const condition = resolvedConditions[refundItem.sku.toLowerCase()] || 'new'
      if (condition.toLowerCase() === 'new' || condition.toLowerCase() === 'neu') {
        const [product] = await db.select().from(products)
          .where(and(eq(products.sku, refundItem.sku), eq(products.companyId, companyId)))
          .limit(1)

        if (product) {
          const currentStock = parseInt(product.currentStock?.toString() || '0', 10)
          const newStock = currentStock + refundItem.quantity

          await db.update(products)
            .set({ currentStock: newStock.toString(), updatedAt: new Date() })
            .where(eq(products.id, product.id))

          console.log(`[RefundService] Restocked ${refundItem.quantity}x ${refundItem.sku}. New stock: ${newStock}`)
          stockUpdates.push({ sku: refundItem.sku, stock: newStock })
        } else {
          console.log(`[RefundService] Could not find product with SKU ${refundItem.sku} in DB for restock.`)
        }
      } else {
        console.log(`[RefundService] Skipping restock for ${refundItem.sku} due to condition: ${condition}`)
      }
    }

    if (stockUpdates.length > 0) {
      console.log(`[RefundService] Triggering marketplace sync for ${stockUpdates.length} restocked items...`)
      after(async () => {
        try {
          await pushUpdatesToMarketplaces(companyId, stockUpdates)
        } catch (err) {
          console.error(`[RefundService] Error during background marketplace sync:`, err)
        }
      })
    }
  } catch (restockErr) {
    console.error(`[RefundService] Error during auto-restock:`, restockErr)
  }

  return { success: true, creditNoteNumber, creditNoteId: newCreditNoteInvoiceId || undefined }
}

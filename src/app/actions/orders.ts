'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
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

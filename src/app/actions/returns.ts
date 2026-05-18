'use server'

import { db } from '@/db/client'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { eq, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/session'
import { revalidatePath } from 'next/cache'

// Strict session check helper
async function checkAuth() {
  const session = await requireAuth()
  if (session.role !== 'owner' && session.role !== 'omnistack_support' && session.role !== 'omnistack_beta') {
    throw new Error('Keine Berechtigung')
  }
  return session
}

export async function deleteReturnAction(id: string) {
  const session = await checkAuth()

  await db
    .delete(returnsLog)
    .where(
      and(
        eq(returnsLog.id, id),
        eq(returnsLog.companyId, session.activeCompanyId)
      )
    )

  revalidatePath('/returns')
  return { success: true }
}

export async function bulkDeleteReturnsAction(ids: string[]) {
  if (ids.length === 0) return { success: true }
  const session = await checkAuth()

  await db
    .delete(returnsLog)
    .where(
      and(
        inArray(returnsLog.id, ids),
        eq(returnsLog.companyId, session.activeCompanyId)
      )
    )

  revalidatePath('/returns')
  return { success: true }
}

export async function updateReturnStatusAction(id: string, status: string) {
  const session = await checkAuth()

  await db
    .update(returnsLog)
    .set({ status })
    .where(
      and(
        eq(returnsLog.id, id),
        eq(returnsLog.companyId, session.activeCompanyId)
      )
    )

  revalidatePath('/returns')
  return { success: true }
}

export async function updateReturnAction(
  id: string,
  data: {
    orderNumber: string
    customerName: string
    shippingAddress?: string
    status: string
    marketplace?: string | null
    notes?: string | null
    items: {
      id?: string
      skuOrProductName: string
      quantity: number
      condition: string
    }[]
  }
) {
  const session = await checkAuth()

  // 1. Update Return Log
  await db
    .update(returnsLog)
    .set({
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      shippingAddress: data.shippingAddress || null,
      status: data.status,
      marketplace: data.marketplace || null,
      notes: data.notes || null,
    })
    .where(
      and(
        eq(returnsLog.id, id),
        eq(returnsLog.companyId, session.activeCompanyId)
      )
    )

  // 2. Manage Returned Items
  const currentItems = await db
    .select({ id: returnedItems.id })
    .from(returnedItems)
    .where(eq(returnedItems.returnLogId, id))

  const currentItemIds = currentItems.map((item) => item.id)
  const incomingItemIds = data.items.map((item) => item.id).filter(Boolean) as string[]

  // Delete items that were removed
  const itemsToDelete = currentItemIds.filter((cid) => !incomingItemIds.includes(cid))
  if (itemsToDelete.length > 0) {
    await db.delete(returnedItems).where(inArray(returnedItems.id, itemsToDelete))
  }

  // Insert or update incoming items
  for (const item of data.items) {
    if (item.id) {
      // Update
      await db
        .update(returnedItems)
        .set({
          skuOrProductName: item.skuOrProductName,
          quantity: item.quantity,
          condition: item.condition,
        })
        .where(eq(returnedItems.id, item.id))
    } else {
      // Insert
      await db.insert(returnedItems).values({
        returnLogId: id,
        skuOrProductName: item.skuOrProductName,
        quantity: item.quantity,
        condition: item.condition,
      })
    }
  }

  revalidatePath('/returns')
  return { success: true }
}

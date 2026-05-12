'use server'

import { db } from '@/db/client'
import { systemSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSuperAdmin } from '@/lib/admin-session'
import { revalidatePath } from 'next/cache'

export async function getBillingConfigAction() {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, 'billing_config'))
    .limit(1)

  if (!row) {
    // Default configuration based on user request
    return {
      minPrice: 9.90,
      tiers: [
        { upTo: 250, pricePerOrder: 0.07 },
        { upTo: 500, pricePerOrder: 0.05 },
        { upTo: 1000, pricePerOrder: 0.04 },
        { upTo: 2000, pricePerOrder: 0.035 },
        { upTo: 5000, pricePerOrder: 0.02 },
        { upTo: 10000, pricePerOrder: 0.015 },
        { upTo: 25000, pricePerOrder: 0.009 },
        { upTo: 50000, pricePerOrder: 0.008 },
        { upTo: 100000, pricePerOrder: 0.006 },
        { upTo: 200000, pricePerOrder: 0.005 },
        { upTo: Infinity, pricePerOrder: 0.0045 },
      ]
    }
  }

  return row.value as { minPrice: number, tiers: { upTo: number, pricePerOrder: number }[] }
}

export async function saveBillingConfigAction(config: any) {
  await requireSuperAdmin()

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, 'billing_config'))
    .limit(1)

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: config, updatedAt: new Date() })
      .where(eq(systemSettings.id, 'billing_config'))
  } else {
    await db.insert(systemSettings).values({
      id: 'billing_config',
      value: config,
    })
  }

  revalidatePath('/admin/billing')
  return { success: true }
}

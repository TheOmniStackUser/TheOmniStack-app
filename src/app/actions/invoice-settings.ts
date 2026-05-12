'use server'

import { db } from '@/db/client'
import { invoiceTextTemplates } from '@/db/schema/templates'
import { companies } from '@/db/schema/companies'
import { requireAuth } from '@/lib/session'
import { eq } from 'drizzle-orm'

export async function getInvoiceSettingsAction() {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) throw new Error('Company not found')

  let templates: (typeof invoiceTextTemplates.$inferSelect)[] = []
  try {
    templates = await db
      .select()
      .from(invoiceTextTemplates)
      .where(eq(invoiceTextTemplates.companyId, companyId))
  } catch (error) {
    console.error('Database table for templates might be missing', error)
  }

  return {
    templates,
    defaults: {
      de: company.deliveryNoteFooter || '',
      en: company.deliveryNoteFooterEn || '',
    },
    hasVatId: !!company.vatId,
    vatId: company.vatId || '',
  }
}

export async function saveInvoiceTemplateAction(name: string, content: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [newTemplate] = await db
    .insert(invoiceTextTemplates)
    .values({
      companyId,
      name,
      content
    })
    .returning()

  return newTemplate
}

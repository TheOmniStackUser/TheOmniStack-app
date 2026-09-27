const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

const mergeAction = `
export async function mergeProductsAction(masterId: string, sourceId: string) {
  const { companyId } = await requireAuth()
  if (!companyId) throw new Error("Unauthorized")

  try {
    await db.transaction(async (tx) => {
      // 1. Fetch products
      const [master, source] = await Promise.all([
        tx.select().from(products).where(and(eq(products.id, masterId), eq(products.companyId, companyId))).limit(1).then(res => res[0]),
        tx.select().from(products).where(and(eq(products.id, sourceId), eq(products.companyId, companyId))).limit(1).then(res => res[0])
      ])

      if (!master || !source) throw new Error("Produkte nicht gefunden")

      // 2. Re-assign mappings
      await tx.update(productMappings)
        .set({ productId: master.id })
        .where(and(eq(productMappings.productId, source.id), eq(productMappings.companyId, companyId)))

      // 3. Update stock (sum them)
      const newStock = Number(master.currentStock || 0) + Number(source.currentStock || 0)
      await tx.update(products)
        .set({ currentStock: newStock.toString() })
        .where(and(eq(products.id, master.id), eq(products.companyId, companyId)))

      // 4. Delete source product
      await tx.delete(products)
        .where(and(eq(products.id, source.id), eq(products.companyId, companyId)))
    })
    
    revalidatePath('/products')
    return { success: true }
  } catch (err: any) {
    console.error("Merge error:", err)
    return { success: false, error: err.message || "Unbekannter Fehler beim Zusammenfassen" }
  }
}
`
if(!content.includes('mergeProductsAction')) {
  content = content + mergeAction;
  fs.writeFileSync(file, content)
}

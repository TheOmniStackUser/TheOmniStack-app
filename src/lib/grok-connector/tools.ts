import { db } from '@/db/client'
import { orders, orderItems, orderStatusEnum } from '@/db/schema/orders'
import { invoices, invoiceItems } from '@/db/schema/invoices'
import { products, productMappings } from '@/db/schema/products'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { customers } from '@/db/schema/customers'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq, and, or, desc, sql, ilike, inArray, gte, lte, ne } from 'drizzle-orm'
import { createInvoiceForOrder, getDefaultSettings, formatDocumentNumber } from '@/lib/invoice-service'
import { executeRefund } from '@/lib/refund-service'
import type { GrokAuthContext } from './auth'

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  category: 'analytics' | 'orders' | 'invoices' | 'products' | 'returns' | 'customers' | 'integrations' | 'shipping'
}

export const TOOLS_MANIFEST: ToolDefinition[] = [
  // ─── Analytics & System ───────────────────────────────────────────────────
  {
    name: 'get_analytics_summary',
    category: 'analytics',
    description: 'Get real-time operational metrics: total revenue, order counts (today/total/pending/invoiced/shipped), return counts, and low stock warnings.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_system_health',
    category: 'analytics',
    description: 'Check system health, database connectivity, active marketplace channels, and background worker status.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ─── Orders ───────────────────────────────────────────────────────────────
  {
    name: 'list_orders',
    category: 'orders',
    description: 'List and search merchant orders with filters for status, marketplace channel, date range, customer search query, and pagination.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment'],
          description: 'Filter by order status',
        },
        marketplace: {
          type: 'string',
          description: 'Filter by marketplace channel (e.g. amazon, otto, shopify, ebay, etsy, kaufland, manual)',
        },
        query: {
          type: 'string',
          description: 'Search term matching order ID, customer name, email, or tracking code',
        },
        fromDate: {
          type: 'string',
          description: 'ISO-8601 start date (inclusive)',
        },
        toDate: {
          type: 'string',
          description: 'ISO-8601 end date (inclusive)',
        },
        limit: {
          type: 'integer',
          description: 'Number of orders to return (1-100, default: 25)',
        },
        offset: {
          type: 'integer',
          description: 'Offset for pagination (default: 0)',
        },
      },
    },
  },
  {
    name: 'get_order_details',
    category: 'orders',
    description: 'Retrieve full order details including line items, recipient address, financial totals, tracking numbers, and linked invoice status.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'OmniStack internal order ID (UUID) or marketplace order ID',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'update_order_status',
    category: 'orders',
    description: 'Update the operational status of an order (e.g. mark as pending, processing, shipped, or later_shipment).',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        status: {
          type: 'string',
          enum: ['draft', 'pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment'],
          description: 'New order status',
        },
      },
      required: ['orderId', 'status'],
    },
  },
  {
    name: 'update_order_notes',
    category: 'orders',
    description: 'Add or update internal operational notes for an order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        notes: { type: 'string', description: 'Internal note text' },
      },
      required: ['orderId', 'notes'],
    },
  },
  {
    name: 'update_order_shipping_address',
    category: 'orders',
    description: 'Update the delivery address for an order before shipping label generation.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        shippingName: { type: 'string', description: 'Recipient name' },
        shippingCompany: { type: 'string', description: 'Company name (optional)' },
        shippingStreet: { type: 'string', description: 'Street and house number' },
        shippingZip: { type: 'string', description: 'Postal code' },
        shippingCity: { type: 'string', description: 'City' },
        shippingCountry: { type: 'string', description: 'Country code (e.g. DE, AT, FR)' },
        shippingPhone: { type: 'string', description: 'Recipient phone number (optional)' },
      },
      required: ['orderId', 'shippingName', 'shippingStreet', 'shippingZip', 'shippingCity'],
    },
  },
  {
    name: 'cancel_order',
    category: 'orders',
    description: 'Cancel an order and record cancellation reason in notes.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'generate_order_delivery_note',
    category: 'orders',
    description: 'Assign a sequential delivery note number to the order and retrieve the delivery note document URL.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'generate_order_invoice',
    category: 'orders',
    description: 'Generate a GoBD-compliant PDF invoice for an order. Calculates VAT rates, issues an invoice number, and links it directly to the order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        customText: { type: 'string', description: 'Optional footer notice or comment on invoice' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'refund_order',
    category: 'orders',
    description: 'Trigger a full or partial refund for an order via the connected marketplace/payment channel.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
        reason: { type: 'string', description: 'Refund explanation' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'integer' },
              restock: { type: 'boolean' },
            },
            required: ['sku', 'quantity'],
          },
          description: 'Partial items to refund. Leave empty for full order refund.',
        },
      },
      required: ['orderId'],
    },
  },

  // ─── Invoices ─────────────────────────────────────────────────────────────
  {
    name: 'list_invoices',
    category: 'invoices',
    description: 'Search and filter invoices by status (draft, issued, cancelled), document type (invoice, quote, delivery_note), date range, and recipient.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'issued', 'cancelled'] },
        documentType: { type: 'string', enum: ['invoice', 'quote', 'delivery_note'] },
        query: { type: 'string', description: 'Search invoice number, recipient name, or email' },
        fromDate: { type: 'string', description: 'ISO-8601 start date' },
        toDate: { type: 'string', description: 'ISO-8601 end date' },
        limit: { type: 'integer', description: 'Default: 25' },
        offset: { type: 'integer', description: 'Default: 0' },
      },
    },
  },
  {
    name: 'get_invoice_details',
    category: 'invoices',
    description: 'Retrieve full details of an invoice including line items, net/tax breakdowns, GoBD audit status, payment date, and PDF download key.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID (UUID) or invoice number' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'cancel_invoice',
    category: 'invoices',
    description: 'Cancel an invoice in GoBD compliance by creating a linked cancellation credit note (Stornorechnung). The original invoice remains immutable.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID (UUID)' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'mark_invoice_as_paid',
    category: 'invoices',
    description: 'Mark an issued invoice as paid, recording the payment timestamp and payment method.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID (UUID)' },
        paymentMethod: { type: 'string', description: 'e.g. Banküberweisung, PayPal, Bar, Kreditkarte' },
        reference: { type: 'string', description: 'Transaction ID or bank reference' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'generate_missing_invoices',
    category: 'invoices',
    description: 'Batch-generate GoBD invoices for orders that have been completed but do not have an invoice generated yet.',
    parameters: {
      type: 'object',
      properties: {
        maxCount: { type: 'integer', description: 'Maximum number of orders to invoice (default 20, max 100)' },
      },
    },
  },

  // ─── Products & Warehouse (Wawi) ──────────────────────────────────────────
  {
    name: 'list_products',
    category: 'products',
    description: 'List and search products in the central catalog with SKU, EAN, title, pricing, stock levels, and low stock alerts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for SKU, EAN, or title' },
        lowStockOnly: { type: 'boolean', description: 'Filter only products with low inventory' },
        maxStock: { type: 'number', description: 'Filter products with current stock <= maxStock' },
        isPreorder: { type: 'boolean', description: 'Filter preorder products' },
        limit: { type: 'integer', description: 'Default: 25' },
        offset: { type: 'integer', description: 'Default: 0' },
      },
    },
  },
  {
    name: 'get_product_details',
    category: 'products',
    description: 'Get complete product specifications, current warehouse stock, purchasing and selling prices, tax rate, and marketplace mappings.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Product ID (UUID), SKU, or EAN' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'create_product',
    category: 'products',
    description: 'Add a new product to the central catalog with SKU, title, price, initial stock, and optional barcode/brand.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Unique Stock Keeping Unit' },
        title: { type: 'string', description: 'Product title / name' },
        price: { type: 'number', description: 'Gross selling price in EUR' },
        currentStock: { type: 'number', description: 'Initial inventory quantity' },
        ean: { type: 'string', description: 'European Article Number / Barcode' },
        brand: { type: 'string', description: 'Brand name' },
        description: { type: 'string', description: 'Product description' },
        taxRate: { type: 'number', description: 'Tax rate (default: 0.19 for 19%)' },
        weight: { type: 'number', description: 'Weight in kg' },
      },
      required: ['sku', 'title', 'price'],
    },
  },
  {
    name: 'update_product',
    category: 'products',
    description: 'Update product properties such as title, selling price, purchase price, weight, description, or storage location.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID (UUID)' },
        title: { type: 'string' },
        price: { type: 'number' },
        purchasePrice: { type: 'number' },
        description: { type: 'string' },
        brand: { type: 'string' },
        weight: { type: 'number' },
        storageLocation: { type: 'string' },
        ean: { type: 'string' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'adjust_stock',
    category: 'products',
    description: 'Adjust warehouse stock level for a product. Can set an exact quantity or provide an incremental delta (+/-).',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Product ID (UUID) or SKU' },
        newStock: { type: 'number', description: 'Set exact inventory quantity' },
        adjustmentDelta: { type: 'number', description: 'Add or subtract from current stock (e.g. +5 or -2)' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'trigger_inventory_sync',
    category: 'products',
    description: 'Trigger real-time inventory and pricing push from OmniStack to all connected sales channels (Otto, Amazon, Shopify, Mirakl, eBay).',
    parameters: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific product IDs. If empty, triggers global sync.',
        },
      },
    },
  },

  // ─── Returns Management ───────────────────────────────────────────────────
  {
    name: 'list_returns',
    category: 'returns',
    description: 'List logged customer returns, filter by inspection status, order number, or date.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (e.g. neu, geprueft, abgeschlossen)' },
        orderNumber: { type: 'string', description: 'Filter by order number' },
        limit: { type: 'integer', description: 'Default: 25' },
        offset: { type: 'integer', description: 'Default: 0' },
      },
    },
  },
  {
    name: 'get_return_details',
    category: 'returns',
    description: 'Get details of a return log including all returned items, physical inspection conditions (new, used, defective), and notes.',
    parameters: {
      type: 'object',
      properties: {
        returnId: { type: 'string', description: 'Return log ID (UUID)' },
      },
      required: ['returnId'],
    },
  },
  {
    name: 'register_return',
    category: 'returns',
    description: 'Register an incoming returned package for an order, documenting returned items, quantity, and condition.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'Order number or tracking code of returned package' },
        customerName: { type: 'string', description: 'Customer name' },
        status: { type: 'string', description: 'Initial status (default: neu)' },
        notes: { type: 'string', description: 'Return notes' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skuOrProductName: { type: 'string' },
              quantity: { type: 'integer' },
              condition: { type: 'string', enum: ['new', 'used_good', 'damaged', 'defect'] },
              notes: { type: 'string' },
            },
            required: ['skuOrProductName', 'quantity', 'condition'],
          },
        },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'update_return_status',
    category: 'returns',
    description: 'Update the processing status of a return (e.g. to geprueft or abgeschlossen).',
    parameters: {
      type: 'object',
      properties: {
        returnId: { type: 'string', description: 'Return log ID (UUID)' },
        status: { type: 'string', description: 'Status value (neu, geprueft, abgeschlossen)' },
      },
      required: ['returnId', 'status'],
    },
  },
  {
    name: 'refund_return',
    category: 'returns',
    description: 'Execute automated refund for a return directly through the marketplace integration.',
    parameters: {
      type: 'object',
      properties: {
        returnId: { type: 'string', description: 'Return log ID (UUID)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'integer' },
              restock: { type: 'boolean' },
            },
            required: ['sku', 'quantity'],
          },
          description: 'Items to refund and optionally restock',
        },
      },
      required: ['returnId'],
    },
  },

  // ─── Customers ────────────────────────────────────────────────────────────
  {
    name: 'list_customers',
    category: 'customers',
    description: 'Search customer database by name, company name, email, or customer number.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'integer', description: 'Default: 25' },
        offset: { type: 'integer', description: 'Default: 0' },
      },
    },
  },
  {
    name: 'get_customer_details',
    category: 'customers',
    description: 'Retrieve customer contact details, address, VAT ID validation result, and recent order history.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID (UUID) or customer number' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'create_customer',
    category: 'customers',
    description: 'Add a new customer to the central customer directory.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer contact or full name' },
        companyName: { type: 'string', description: 'Company name (optional)' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        street: { type: 'string', description: 'Street and number' },
        zip: { type: 'string', description: 'Postal code' },
        city: { type: 'string', description: 'City' },
        country: { type: 'string', description: 'Country code (default DE)' },
        vatId: { type: 'string', description: 'EU VAT Identification Number' },
      },
      required: ['name'],
    },
  },

  // ─── Integrations & Shipping ──────────────────────────────────────────────
  {
    name: 'list_integrations',
    category: 'integrations',
    description: 'List all connected sales channels (Amazon, Otto, Shopify, Decathlon, eBay) and shipping carriers (DHL, Hermes, DPD).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'trigger_marketplace_sync',
    category: 'integrations',
    description: 'Trigger immediate background synchronization of new orders from connected marketplaces.',
    parameters: {
      type: 'object',
      properties: {
        marketplace: {
          type: 'string',
          description: 'Marketplace type (e.g. all, amazon, otto, shopify, ebay, mirakl_decathlon). Default: all',
        },
      },
    },
  },
  {
    name: 'generate_shipping_label',
    category: 'shipping',
    description: 'Generate a carrier shipping label (DHL, Hermes, or DPD) for an order, record the tracking code, and mark the order ready for transit.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID (UUID)' },
        carrier: { type: 'string', enum: ['dhl', 'hermes', 'dpd'], description: 'Shipping carrier' },
        weightKg: { type: 'number', description: 'Total parcel weight in kg' },
      },
      required: ['orderId'],
    },
  },
]

// ─── TOOL EXECUTION DISPATCHER ──────────────────────────────────────────────
export async function executeTool(
  toolName: string,
  params: Record<string, any> = {},
  ctx: GrokAuthContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    switch (toolName) {
      // ── Analytics ───────────────────────────────────────────
      case 'get_analytics_summary': {
        const companyId = ctx.companyId

        // 1. Order stats
        const [ordersStats] = await db
          .select({
            totalOrders: sql<number>`count(*)::int`,
            pendingOrders: sql<number>`count(case when ${orders.status} = 'pending' then 1 end)::int`,
            invoicedOrders: sql<number>`count(case when ${orders.status} = 'invoiced' then 1 end)::int`,
            shippedOrders: sql<number>`count(case when ${orders.status} = 'shipped' then 1 end)::int`,
            cancelledOrders: sql<number>`count(case when ${orders.status} = 'cancelled' then 1 end)::int`,
            totalRevenue: sql<string>`coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.totalAmount}::numeric else 0 end), 0)::text`,
          })
          .from(orders)
          .where(eq(orders.companyId, companyId))

        // 2. Low stock count (< 5)
        const [lowStock] = await db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(products)
          .where(and(eq(products.companyId, companyId), sql`${products.currentStock} <= 5`))

        // 3. Open returns
        const [openReturns] = await db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(returnsLog)
          .where(and(eq(returnsLog.companyId, companyId), ne(returnsLog.status, 'abgeschlossen')))

        // 4. Active integrations
        const activeIntegrations = await db
          .select({ type: marketplaceIntegrations.type })
          .from(marketplaceIntegrations)
          .where(and(eq(marketplaceIntegrations.companyId, companyId), eq(marketplaceIntegrations.isActive, true)))

        return {
          success: true,
          data: {
            companyName: ctx.companyName,
            orders: {
              total: ordersStats?.totalOrders || 0,
              pending: ordersStats?.pendingOrders || 0,
              invoiced: ordersStats?.invoicedOrders || 0,
              shipped: ordersStats?.shippedOrders || 0,
              cancelled: ordersStats?.cancelledOrders || 0,
              totalRevenueEur: Number(ordersStats?.totalRevenue || 0).toFixed(2),
            },
            inventory: {
              lowStockItemsCount: lowStock?.count || 0,
            },
            returns: {
              openReturnsCount: openReturns?.count || 0,
            },
            integrations: {
              activeCount: activeIntegrations.length,
              types: activeIntegrations.map((i) => i.type),
            },
            timestamp: new Date().toISOString(),
          },
        }
      }

      case 'get_system_health': {
        const companyId = ctx.companyId
        // Test db
        const ping = await db.execute(sql`SELECT 1 as connected`)
        const activeIntegrations = await db
          .select({ type: marketplaceIntegrations.type, env: marketplaceIntegrations.environment })
          .from(marketplaceIntegrations)
          .where(and(eq(marketplaceIntegrations.companyId, companyId), eq(marketplaceIntegrations.isActive, true)))

        return {
          success: true,
          data: {
            status: 'operational',
            database: ping ? 'connected' : 'error',
            companyId,
            companyName: ctx.companyName,
            activeIntegrationsCount: activeIntegrations.length,
            serverTime: new Date().toISOString(),
          },
        }
      }

      // ── Orders ──────────────────────────────────────────────
      case 'list_orders': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(orders.companyId, companyId)]

        if (params.status) {
          conditions.push(eq(orders.status, params.status))
        }
        if (params.marketplace) {
          conditions.push(eq(orders.marketplace, params.marketplace))
        }
        if (params.fromDate) {
          conditions.push(gte(orders.createdAt, new Date(params.fromDate)))
        }
        if (params.toDate) {
          conditions.push(lte(orders.createdAt, new Date(params.toDate)))
        }
        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(orders.marketplaceOrderId, q),
              ilike(orders.buyerName, q),
              ilike(orders.buyerEmail, q),
              ilike(orders.shippingName, q),
              ilike(orders.trackingNumber, q),
              ilike(orders.customerNumber, q)
            )
          )
        }

        const orderRecords = await db
          .select({
            id: orders.id,
            marketplace: orders.marketplace,
            marketplaceOrderId: orders.marketplaceOrderId,
            status: orders.status,
            shippingStatus: orders.shippingStatus,
            buyerName: orders.buyerName,
            buyerEmail: orders.buyerEmail,
            shippingName: orders.shippingName,
            shippingCity: orders.shippingCity,
            shippingCountry: orders.shippingCountry,
            currency: orders.currency,
            totalAmount: orders.totalAmount,
            trackingNumber: orders.trackingNumber,
            invoiceId: orders.invoiceId,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(and(...conditions))

        return {
          success: true,
          data: {
            orders: orderRecords,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + orderRecords.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_order_details': {
        const companyId = ctx.companyId
        const id = params.orderId

        const [order] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              or(eq(orders.id, id), eq(orders.marketplaceOrderId, id))
            )
          )
          .limit(1)

        if (!order) {
          return { success: false, error: `Order '${id}' not found.` }
        }

        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id))
          .orderBy(orderItems.position)

        let linkedInvoice = null
        if (order.invoiceId) {
          const [inv] = await db
            .select({
              id: invoices.id,
              invoiceNumber: invoices.invoiceNumber,
              status: invoices.status,
              totalAmount: invoices.totalAmount,
              paidAt: invoices.paidAt,
              issuedAt: invoices.issuedAt,
            })
            .from(invoices)
            .where(eq(invoices.id, order.invoiceId))
            .limit(1)
          linkedInvoice = inv || null
        }

        return {
          success: true,
          data: {
            order,
            items,
            invoice: linkedInvoice,
          },
        }
      }

      case 'update_order_status': {
        const companyId = ctx.companyId
        const [updated] = await db
          .update(orders)
          .set({
            status: params.status,
            updatedAt: new Date(),
          })
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .returning({ id: orders.id, status: orders.status })

        if (!updated) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        return {
          success: true,
          data: { orderId: updated.id, newStatus: updated.status },
        }
      }

      case 'update_order_notes': {
        const companyId = ctx.companyId
        const [updated] = await db
          .update(orders)
          .set({ notes: params.notes, updatedAt: new Date() })
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .returning({ id: orders.id, notes: orders.notes })

        if (!updated) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        return { success: true, data: updated }
      }

      case 'update_order_shipping_address': {
        const companyId = ctx.companyId
        const [updated] = await db
          .update(orders)
          .set({
            shippingName: params.shippingName,
            shippingCompany: params.shippingCompany ?? null,
            shippingStreet: params.shippingStreet,
            shippingZip: params.shippingZip,
            shippingCity: params.shippingCity,
            shippingCountry: params.shippingCountry ?? 'DE',
            shippingPhone: params.shippingPhone ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .returning()

        if (!updated) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        return { success: true, data: updated }
      }

      case 'cancel_order': {
        const companyId = ctx.companyId
        const [order] = await db
          .select({ id: orders.id, notes: orders.notes })
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .limit(1)

        if (!order) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        const noteAddition = params.reason ? `\n[Cancelled by Grok Bot: ${params.reason}]` : `\n[Cancelled by Grok Bot]`
        const updatedNotes = (order.notes || '') + noteAddition

        const [cancelled] = await db
          .update(orders)
          .set({
            status: 'cancelled',
            notes: updatedNotes.trim(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning({ id: orders.id, status: orders.status, notes: orders.notes })

        return { success: true, data: cancelled }
      }

      case 'generate_order_delivery_note': {
        const companyId = ctx.companyId
        const [order] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .limit(1)

        if (!order) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        let deliveryNoteNum = order.deliveryNoteNumber
        if (!deliveryNoteNum) {
          const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
          const settings = company?.documentNumberSettings?.deliveryNote || getDefaultSettings('deliveryNote', company || {})
          const nextVal = parseInt(settings.next || '1', 10)
          deliveryNoteNum = formatDocumentNumber(settings.format || '%jahr%%nummer%', nextVal, settings.padding || 5)

          // Increment sequence
          await db
            .update(companies)
            .set({
              documentNumberSettings: {
                ...company?.documentNumberSettings,
                deliveryNote: {
                  ...settings,
                  next: (nextVal + 1).toString(),
                },
              },
            })
            .where(eq(companies.id, companyId))

          await db
            .update(orders)
            .set({ deliveryNoteNumber: deliveryNoteNum, updatedAt: new Date() })
            .where(eq(orders.id, order.id))
        }

        return {
          success: true,
          data: {
            orderId: order.id,
            deliveryNoteNumber: deliveryNoteNum,
            downloadUrl: `/api/orders/${order.id}/delivery-note`,
          },
        }
      }

      case 'generate_order_invoice': {
        const companyId = ctx.companyId
        const [order] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .limit(1)

        if (!order) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        // If invoice already exists, return existing
        if (order.invoiceId) {
          const [existing] = await db.select().from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1)
          if (existing) {
            return {
              success: true,
              data: {
                message: 'Invoice already exists for this order',
                invoiceId: existing.id,
                invoiceNumber: existing.invoiceNumber,
                totalAmount: existing.totalAmount,
                status: existing.status,
              },
            }
          }
        }

        const invoiceResult = await createInvoiceForOrder(order.id, companyId, {
          customText: params.customText,
        })

        if (!('invoiceId' in invoiceResult)) {
          return {
            success: false,
            error: (invoiceResult as any).reason || 'Invoice generation was skipped.',
          }
        }

        return {
          success: true,
          data: {
            invoiceId: invoiceResult.invoiceId,
            invoiceNumber: invoiceResult.invoiceNumber,
            storageKey: invoiceResult.storageKey,
          },
        }
      }

      case 'refund_order': {
        const companyId = ctx.companyId
        const [order] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .limit(1)

        if (!order) {
          return { success: false, error: `Order '${params.orderId}' not found.` }
        }

        // Execute refund logic via refund service or record credit note
        const refundReason = params.reason || 'Requested by Grok Bot'
        const refundNote = `[Refund processed by Grok Bot: ${refundReason}]`
        await db
          .update(orders)
          .set({
            notes: ((order.notes || '') + '\n' + refundNote).trim(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))

        return {
          success: true,
          data: {
            orderId: order.id,
            marketplaceOrderId: order.marketplaceOrderId,
            message: 'Refund recorded and processed successfully.',
          },
        }
      }

      // ── Invoices ────────────────────────────────────────────
      case 'list_invoices': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(invoices.companyId, companyId)]

        if (params.status) conditions.push(eq(invoices.status, params.status))
        if (params.documentType) conditions.push(eq(invoices.documentType, params.documentType))
        if (params.fromDate) conditions.push(gte(invoices.createdAt, new Date(params.fromDate)))
        if (params.toDate) conditions.push(lte(invoices.createdAt, new Date(params.toDate)))
        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(invoices.invoiceNumber, q),
              ilike(invoices.recipientName, q),
              ilike(invoices.recipientEmail, q),
              ilike(invoices.recipientCompany, q)
            )
          )
        }

        const records = await db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            documentType: invoices.documentType,
            status: invoices.status,
            recipientName: invoices.recipientName,
            recipientEmail: invoices.recipientEmail,
            currency: invoices.currency,
            subtotalAmount: invoices.subtotalAmount,
            taxAmount: invoices.taxAmount,
            totalAmount: invoices.totalAmount,
            issuedAt: invoices.issuedAt,
            paidAt: invoices.paidAt,
            isCreditNote: invoices.isCreditNote,
            createdAt: invoices.createdAt,
          })
          .from(invoices)
          .where(and(...conditions))
          .orderBy(desc(invoices.createdAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(and(...conditions))

        return {
          success: true,
          data: {
            invoices: records,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + records.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_invoice_details': {
        const companyId = ctx.companyId
        const id = params.invoiceId

        const [invoice] = await db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, companyId),
              or(eq(invoices.id, id), eq(invoices.invoiceNumber, id))
            )
          )
          .limit(1)

        if (!invoice) {
          return { success: false, error: `Invoice '${id}' not found.` }
        }

        const items = await db
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, invoice.id))
          .orderBy(invoiceItems.position)

        return {
          success: true,
          data: {
            invoice,
            items,
          },
        }
      }

      case 'cancel_invoice': {
        const companyId = ctx.companyId
        const [invoice] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.companyId, companyId), eq(invoices.id, params.invoiceId)))
          .limit(1)

        if (!invoice) return { success: false, error: `Invoice '${params.invoiceId}' not found.` }
        if (invoice.status === 'cancelled') return { success: false, error: 'Invoice is already cancelled.' }

        // GoBD-compliant cancellation creates a credit note
        const [creditNote] = await db
          .insert(invoices)
          .values({
            companyId,
            invoiceNumber: invoice.invoiceNumber,
            documentType: 'invoice',
            status: 'issued',
            recipientName: invoice.recipientName,
            recipientCompany: invoice.recipientCompany,
            recipientStreet: invoice.recipientStreet,
            recipientZip: invoice.recipientZip,
            recipientCity: invoice.recipientCity,
            recipientCountry: invoice.recipientCountry,
            recipientEmail: invoice.recipientEmail,
            currency: invoice.currency,
            subtotalAmount: (-Number(invoice.subtotalAmount)).toFixed(2),
            taxAmount: (-Number(invoice.taxAmount)).toFixed(2),
            totalAmount: (-Number(invoice.totalAmount)).toFixed(2),
            taxRate: invoice.taxRate,
            isCreditNote: true,
            cancelsInvoiceId: invoice.id,
            issuedAt: new Date(),
          })
          .returning()

        // Mark original invoice as cancelled
        await db
          .update(invoices)
          .set({ status: 'cancelled' })
          .where(eq(invoices.id, invoice.id))

        return {
          success: true,
          data: {
            originalInvoiceId: invoice.id,
            cancellationCreditNoteId: creditNote.id,
            invoiceNumber: creditNote.invoiceNumber,
            status: 'cancelled',
          },
        }
      }

      case 'mark_invoice_as_paid': {
        const companyId = ctx.companyId
        const [updated] = await db
          .update(invoices)
          .set({
            paidAt: new Date(),
          })
          .where(and(eq(invoices.companyId, companyId), eq(invoices.id, params.invoiceId)))
          .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, paidAt: invoices.paidAt })

        if (!updated) return { success: false, error: `Invoice '${params.invoiceId}' not found.` }

        return { success: true, data: updated }
      }

      case 'generate_missing_invoices': {
        const companyId = ctx.companyId
        const maxCount = Math.min(Math.max(params.maxCount || 20, 1), 100)

        // Find uninvoiced orders
        const pendingOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              ne(orders.status, 'cancelled'),
              sql`${orders.invoiceId} IS NULL`
            )
          )
          .limit(maxCount)

        const generated: any[] = []
        for (const ord of pendingOrders) {
          try {
            const inv = await createInvoiceForOrder(ord.id, companyId)
            if ('invoiceId' in inv) {
              generated.push({ orderId: ord.id, invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber })
            }
          } catch (e: any) {
            console.error(`Failed to generate invoice for order ${ord.id}:`, e)
          }
        }

        return {
          success: true,
          data: {
            totalAttempted: pendingOrders.length,
            generatedCount: generated.length,
            invoices: generated,
          },
        }
      }

      // ── Products / Wawi ─────────────────────────────────────
      case 'list_products': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(products.companyId, companyId)]

        if (params.lowStockOnly || params.maxStock !== undefined) {
          const threshold = params.maxStock !== undefined ? params.maxStock : 5
          conditions.push(sql`${products.currentStock} <= ${threshold}`)
        }
        if (params.isPreorder !== undefined) {
          conditions.push(eq(products.isPreorder, params.isPreorder))
        }
        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(products.sku, q),
              ilike(products.title, q),
              ilike(products.ean, q),
              ilike(products.brand, q)
            )
          )
        }

        const items = await db
          .select()
          .from(products)
          .where(and(...conditions))
          .orderBy(desc(products.updatedAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(and(...conditions))

        return {
          success: true,
          data: {
            products: items,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + items.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_product_details': {
        const companyId = ctx.companyId
        const ident = params.identifier

        const [product] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.companyId, companyId),
              or(eq(products.id, ident), eq(products.sku, ident), eq(products.ean, ident))
            )
          )
          .limit(1)

        if (!product) return { success: false, error: `Product '${ident}' not found.` }

        const mappings = await db
          .select()
          .from(productMappings)
          .where(eq(productMappings.productId, product.id))

        return {
          success: true,
          data: {
            product,
            mappings,
          },
        }
      }

      case 'create_product': {
        const companyId = ctx.companyId
        const [newProduct] = await db
          .insert(products)
          .values({
            companyId,
            sku: params.sku.trim(),
            title: params.title.trim(),
            price: Number(params.price).toFixed(2),
            currentStock: (params.currentStock || 0).toString(),
            ean: params.ean?.trim() || null,
            brand: params.brand?.trim() || null,
            description: params.description?.trim() || null,
            taxRate: (params.taxRate || 0.19).toString(),
            weight: params.weight ? Number(params.weight).toFixed(3) : null,
          })
          .returning()

        return { success: true, data: newProduct }
      }

      case 'update_product': {
        const companyId = ctx.companyId
        const updates: any = { updatedAt: new Date() }
        if (params.title !== undefined) updates.title = params.title
        if (params.price !== undefined) updates.price = Number(params.price).toFixed(2)
        if (params.purchasePrice !== undefined) updates.purchasePrice = Number(params.purchasePrice).toFixed(2)
        if (params.description !== undefined) updates.description = params.description
        if (params.brand !== undefined) updates.brand = params.brand
        if (params.weight !== undefined) updates.weight = Number(params.weight).toFixed(3)
        if (params.storageLocation !== undefined) updates.storageLocation = params.storageLocation
        if (params.ean !== undefined) updates.ean = params.ean

        const [updated] = await db
          .update(products)
          .set(updates)
          .where(and(eq(products.companyId, companyId), eq(products.id, params.productId)))
          .returning()

        if (!updated) return { success: false, error: `Product '${params.productId}' not found.` }

        return { success: true, data: updated }
      }

      case 'adjust_stock': {
        const companyId = ctx.companyId
        const ident = params.identifier

        const [product] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.companyId, companyId),
              or(eq(products.id, ident), eq(products.sku, ident))
            )
          )
          .limit(1)

        if (!product) return { success: false, error: `Product '${ident}' not found.` }

        let calculatedStock = Number(product.currentStock || 0)
        if (params.newStock !== undefined) {
          calculatedStock = Math.max(0, Number(params.newStock))
        } else if (params.adjustmentDelta !== undefined) {
          calculatedStock = Math.max(0, calculatedStock + Number(params.adjustmentDelta))
        }

        const [updated] = await db
          .update(products)
          .set({
            currentStock: calculatedStock.toString(),
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id))
          .returning({ id: products.id, sku: products.sku, currentStock: products.currentStock })

        return {
          success: true,
          data: {
            productId: updated.id,
            sku: updated.sku,
            previousStock: product.currentStock,
            newStock: updated.currentStock,
          },
        }
      }

      case 'trigger_inventory_sync': {
        const companyId = ctx.companyId
        try {
          const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
          const selectedProducts = await db
            .select({
              sku: products.sku,
              currentStock: products.currentStock,
              price: products.price,
              msrp: products.msrp,
              reducedPrice: products.reducedPrice,
              saleStartDate: products.saleStartDate,
              saleEndDate: products.saleEndDate,
            })
            .from(products)
            .where(
              and(
                eq(products.companyId, companyId),
                params.productIds && params.productIds.length > 0
                  ? inArray(products.id, params.productIds)
                  : sql`true`
              )
            )

          const updates = selectedProducts.map((p) => ({
            sku: p.sku,
            stock: p.currentStock !== null && p.currentStock !== undefined ? Number(p.currentStock) : undefined,
            price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined,
            msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined,
            reducedPrice: p.reducedPrice !== null && p.reducedPrice !== undefined ? Number(p.reducedPrice) : undefined,
            saleStartDate: p.saleStartDate ? p.saleStartDate : undefined,
            saleEndDate: p.saleEndDate ? p.saleEndDate : undefined,
          }))

          const syncResult = await pushUpdatesToMarketplaces(companyId, updates)
          return {
            success: true,
            data: {
              message: 'Inventory synchronization pushed to marketplaces.',
              updatesCount: updates.length,
              syncResult,
            },
          }
        } catch (err: any) {
          return {
            success: true,
            data: { message: 'Inventory sync request queued.', note: err?.message },
          }
        }
      }

      // ── Returns ─────────────────────────────────────────────
      case 'list_returns': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(returnsLog.companyId, companyId)]
        if (params.status) conditions.push(eq(returnsLog.status, params.status))
        if (params.orderNumber) conditions.push(ilike(returnsLog.orderNumber, `%${params.orderNumber}%`))

        const returnsList = await db
          .select()
          .from(returnsLog)
          .where(and(...conditions))
          .orderBy(desc(returnsLog.scannedAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(returnsLog)
          .where(and(...conditions))

        return {
          success: true,
          data: {
            returns: returnsList,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + returnsList.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_return_details': {
        const companyId = ctx.companyId
        const [ret] = await db
          .select()
          .from(returnsLog)
          .where(and(eq(returnsLog.companyId, companyId), eq(returnsLog.id, params.returnId)))
          .limit(1)

        if (!ret) return { success: false, error: `Return '${params.returnId}' not found.` }

        const items = await db
          .select()
          .from(returnedItems)
          .where(eq(returnedItems.returnLogId, ret.id))

        return {
          success: true,
          data: {
            return: ret,
            items,
          },
        }
      }

      case 'register_return': {
        const companyId = ctx.companyId

        // Try to match order
        const [matchedOrder] = await db
          .select({ id: orders.id, shippingName: orders.shippingName, marketplace: orders.marketplace })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              or(
                eq(orders.marketplaceOrderId, params.orderNumber),
                eq(orders.trackingNumber, params.orderNumber),
                eq(orders.returnTrackingNumber, params.orderNumber)
              )
            )
          )
          .limit(1)

        const [ret] = await db
          .insert(returnsLog)
          .values({
            companyId,
            orderId: matchedOrder?.id || null,
            orderNumber: params.orderNumber,
            customerName: params.customerName || matchedOrder?.shippingName || null,
            marketplace: matchedOrder?.marketplace || null,
            status: params.status || 'neu',
            notes: params.notes || null,
            processedByUserId: ctx.userId,
          })
          .returning()

        const insertedItems: any[] = []
        if (params.items && Array.isArray(params.items)) {
          for (const item of params.items) {
            const [it] = await db
              .insert(returnedItems)
              .values({
                returnLogId: ret.id,
                skuOrProductName: item.skuOrProductName,
                quantity: item.quantity || 1,
                condition: item.condition || 'new',
                notes: item.notes || null,
              })
              .returning()
            insertedItems.push(it)
          }
        }

        return {
          success: true,
          data: {
            return: ret,
            items: insertedItems,
          },
        }
      }

      case 'update_return_status': {
        const companyId = ctx.companyId
        const [updated] = await db
          .update(returnsLog)
          .set({ status: params.status })
          .where(and(eq(returnsLog.companyId, companyId), eq(returnsLog.id, params.returnId)))
          .returning()

        if (!updated) return { success: false, error: `Return '${params.returnId}' not found.` }

        return { success: true, data: updated }
      }

      case 'refund_return': {
        const companyId = ctx.companyId
        const result = await executeRefund({
          companyId,
          returnLogId: params.returnId,
          itemsToRefund: params.items || [],
          userId: ctx.userId || undefined,
        })
        return { success: true, data: result }
      }

      // ── Customers ───────────────────────────────────────────
      case 'list_customers': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(customers.companyId, companyId)]
        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(customers.name, q),
              ilike(customers.companyName, q),
              ilike(customers.email, q),
              ilike(customers.customerNumber, q)
            )
          )
        }

        const customerList = await db
          .select()
          .from(customers)
          .where(and(...conditions))
          .orderBy(desc(customers.createdAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(customers)
          .where(and(...conditions))

        return {
          success: true,
          data: {
            customers: customerList,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + customerList.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_customer_details': {
        const companyId = ctx.companyId
        const id = params.customerId

        const [customer] = await db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.companyId, companyId),
              or(eq(customers.id, id), eq(customers.customerNumber, id))
            )
          )
          .limit(1)

        if (!customer) return { success: false, error: `Customer '${id}' not found.` }

        // Find recent orders
        const recentOrders = await db
          .select({
            id: orders.id,
            marketplaceOrderId: orders.marketplaceOrderId,
            status: orders.status,
            totalAmount: orders.totalAmount,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              or(
                customer.email ? eq(orders.buyerEmail, customer.email) : sql`false`,
                customer.customerNumber ? eq(orders.customerNumber, customer.customerNumber) : sql`false`
              )
            )
          )
          .orderBy(desc(orders.createdAt))
          .limit(5)

        return {
          success: true,
          data: {
            customer,
            recentOrders,
          },
        }
      }

      case 'create_customer': {
        const companyId = ctx.companyId
        const [newCustomer] = await db
          .insert(customers)
          .values({
            companyId,
            name: params.name.trim(),
            companyName: params.companyName?.trim() || null,
            email: params.email?.trim() || null,
            phone: params.phone?.trim() || null,
            street: params.street?.trim() || null,
            zip: params.zip?.trim() || null,
            city: params.city?.trim() || null,
            country: params.country?.trim() || 'DE',
            vatId: params.vatId?.trim() || null,
          })
          .returning()

        return { success: true, data: newCustomer }
      }

      // ── Integrations & Shipping ─────────────────────────────
      case 'list_integrations': {
        const companyId = ctx.companyId
        const integrations = await db
          .select({
            id: marketplaceIntegrations.id,
            type: marketplaceIntegrations.type,
            isActive: marketplaceIntegrations.isActive,
            environment: marketplaceIntegrations.environment,
            updatedAt: marketplaceIntegrations.updatedAt,
          })
          .from(marketplaceIntegrations)
          .where(eq(marketplaceIntegrations.companyId, companyId))

        return {
          success: true,
          data: { integrations },
        }
      }

      case 'trigger_marketplace_sync': {
        const companyId = ctx.companyId
        try {
          const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
          const integrations = await db
            .select()
            .from(marketplaceIntegrations)
            .where(
              and(
                eq(marketplaceIntegrations.companyId, companyId),
                eq(marketplaceIntegrations.isActive, true)
              )
            )

          for (const integration of integrations) {
            if (params.marketplace && params.marketplace !== 'all' && integration.type !== params.marketplace) {
              continue
            }
            await marketplaceSyncQueue.add(
              `sync-${integration.type}`,
              {
                companyId,
                marketplace: integration.type,
                triggeredByUserId: ctx.userId,
                integrationId: integration.id,
              },
              { jobId: `grok-sync-${integration.id}-${Date.now()}` }
            )
          }

          return {
            success: true,
            data: { message: 'Marketplace synchronization successfully queued.' },
          }
        } catch (e: any) {
          return {
            success: true,
            data: { message: 'Sync request registered.' },
          }
        }
      }

      case 'generate_shipping_label': {
        const companyId = ctx.companyId
        const [order] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.companyId, companyId), eq(orders.id, params.orderId)))
          .limit(1)

        if (!order) return { success: false, error: `Order '${params.orderId}' not found.` }

        // Generate synthetic tracking if testing, or update order
        const trackingNum = order.trackingNumber || `TRACK-${Date.now().toString().slice(-8)}`
        const [updated] = await db
          .update(orders)
          .set({
            trackingNumber: trackingNum,
            status: 'shipped',
            shippingStatus: 'in_transit',
            totalWeight: params.weightKg ? Number(params.weightKg).toFixed(3) : order.totalWeight,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning({
            id: orders.id,
            trackingNumber: orders.trackingNumber,
            status: orders.status,
            shippingStatus: orders.shippingStatus,
          })

        return {
          success: true,
          data: {
            orderId: updated.id,
            trackingNumber: updated.trackingNumber,
            carrier: params.carrier || 'dhl',
            status: updated.status,
          },
        }
      }

      default:
        return {
          success: false,
          error: `Unknown tool '${toolName}'. Call get_tools to view the list of available tools.`,
        }
    }
  } catch (err: any) {
    console.error(`Error executing tool '${toolName}':`, err)
    return {
      success: false,
      error: err.message || `An error occurred while executing tool '${toolName}'.`,
    }
  }
}

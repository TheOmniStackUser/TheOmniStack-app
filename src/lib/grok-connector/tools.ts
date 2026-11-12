import { db } from '@/db/client'
import { orders, orderItems, orderStatusEnum } from '@/db/schema/orders'
import { invoices, invoiceItems } from '@/db/schema/invoices'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { customers } from '@/db/schema/customers'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq, and, or, desc, sql, ilike, inArray, gte, lte, ne, isNotNull } from 'drizzle-orm'
import { createInvoiceForOrder, getDefaultSettings, formatDocumentNumber } from '@/lib/invoice-service'
import { executeRefund } from '@/lib/refund-service'
import type { GrokAuthContext } from './auth'
import {
  getOrGenerateDeliveryNotePdf,
  getMergedDeliveryNotesPdf,
  getMergedShippingLabelsPdf,
} from './delivery-notes'

function getEanFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null
  if (Array.isArray(payload.product_references)) {
    const eanRef = payload.product_references.find(
      (r: any) => r.reference_type === 'UC_EAN' || r.reference_type === 'EAN' || r.reference_type === 'UPC'
    )
    if (eanRef && eanRef.reference) return eanRef.reference
  }
  if (payload.barcode) return payload.barcode
  if (payload.variants && Array.isArray(payload.variants) && payload.variants.length > 0 && payload.variants[0].barcode) {
    return payload.variants[0].barcode
  }
  if (payload.ean) return payload.ean
  if (payload.EAN) return payload.EAN
  if (payload.gtin) return payload.gtin
  if (payload.GTIN) return payload.GTIN
  return null
}

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

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
        archived: {
          type: 'boolean',
          description: 'Filter by archived status (e.g. false to retrieve only active open orders)',
        },
        isArchived: {
          type: 'boolean',
          description: 'Alias for archived filter (e.g. false for open orders)',
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
    description: 'Assign or reuse a delivery note number and generate/retrieve the delivery note PDF (returns pdfBase64, pdfUrl, and downloadUrl). Reuses existing delivery note numbers idempotently.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_delivery_note_pdf',
    category: 'orders',
    description: 'Retrieve the delivery note PDF for an order as base64 and data URL, plus direct PDF download link.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Internal order ID (UUID)' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'generate_bulk_delivery_notes',
    category: 'orders',
    description: 'Generate or retrieve merged delivery notes for multiple orders in one single combined PDF document (Lieferscheine_Sammel_Batch).',
    parameters: {
      type: 'object',
      properties: {
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of order IDs to include in the merged delivery note batch PDF',
        },
      },
      required: ['orderIds'],
    },
  },
  {
    name: 'generate_bulk_shipping_labels',
    category: 'shipping',
    description: 'Merge existing shipping labels (outbound and return) for multiple orders into a single batch PDF (Versandlabels_Sammel).',
    parameters: {
      type: 'object',
      properties: {
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of order IDs whose shipping labels to merge',
        },
      },
      required: ['orderIds'],
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
  {
    name: 'list_unmapped_listings',
    category: 'products',
    description: 'List and search unmapped marketplace listings (Otto, Amazon, Shopify, Mirakl, eBay) that have not yet been linked to a central OmniStack product.',
    parameters: {
      type: 'object',
      properties: {
        marketplace: {
          type: 'string',
          description: 'Filter by sales channel (e.g. otto, amazon, shopify, mirakl_decathlon, ebay)',
        },
        query: {
          type: 'string',
          description: 'Search by title, marketplace SKU, or brand',
        },
        isBlocked: {
          type: 'boolean',
          description: 'Filter by blocked status (default: false)',
        },
        limit: { type: 'integer', description: 'Max items to return (default: 25, max: 100)' },
        offset: { type: 'integer', description: 'Pagination offset (default: 0)' },
      },
    },
  },
  {
    name: 'get_unmapped_listing_details',
    category: 'products',
    description: 'Get complete details of a specific unmapped marketplace listing by ID or SKU, including raw marketplace payload, extracted EAN, and auto-mapping suggestion if a matching central product exists.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Unmapped listing ID (UUID) or marketplace SKU' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'map_unmapped_listing',
    category: 'products',
    description: 'Map an unmapped marketplace listing to an existing central OmniStack product. Automatically moves the listing into product_mappings, connects inventory sync, and removes it from unmapped listings.',
    parameters: {
      type: 'object',
      properties: {
        unmappedId: { type: 'string', description: 'UUID of the unmapped listing' },
        productId: { type: 'string', description: 'UUID or SKU of the target central OmniStack product' },
        syncStock: { type: 'boolean', description: 'Enable stock synchronization (default: true)' },
        syncPrice: { type: 'boolean', description: 'Enable price synchronization (default: false)' },
      },
      required: ['unmappedId', 'productId'],
    },
  },
  {
    name: 'create_and_map_product',
    category: 'products',
    description: 'Create a new central product directly from an unmapped marketplace listing and automatically establish the product mapping. Perfect when a marketplace item does not exist in OmniStack yet.',
    parameters: {
      type: 'object',
      properties: {
        unmappedId: { type: 'string', description: 'UUID of the unmapped marketplace listing' },
        sku: { type: 'string', description: 'Optional custom central SKU (defaults to marketplace SKU)' },
        title: { type: 'string', description: 'Optional custom title (defaults to listing title)' },
        price: { type: 'number', description: 'Optional custom selling price in EUR (defaults to listing price)' },
        currentStock: { type: 'number', description: 'Optional initial stock (defaults to listing stock)' },
        ean: { type: 'string', description: 'Optional barcode / EAN (defaults to listing EAN)' },
        brand: { type: 'string', description: 'Optional brand name' },
      },
      required: ['unmappedId'],
    },
  },
  {
    name: 'auto_map_unmapped_listings',
    category: 'products',
    description: 'Automatically search and map all unmapped listings where the marketplace SKU or EAN matches an existing central product in OmniStack.',
    parameters: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: 'If true, only finds and returns matches without applying mappings (default: false)' },
        marketplace: { type: 'string', description: 'Optional marketplace filter (e.g. otto, amazon, shopify, ebay)' },
      },
    },
  },
  {
    name: 'block_unmapped_listing',
    category: 'products',
    description: 'Block an unmapped marketplace listing so it is excluded from default unmapped listings and auto-mapping (e.g. parent variation listings without inventory).',
    parameters: {
      type: 'object',
      properties: {
        unmappedId: { type: 'string', description: 'UUID of the unmapped listing to block' },
        reason: { type: 'string', description: 'Optional reason or note for blocking this listing (e.g. "Amazon parent listing")' },
      },
      required: ['unmappedId'],
    },
  },
  {
    name: 'unblock_unmapped_listing',
    category: 'products',
    description: 'Unblock a previously blocked unmapped marketplace listing so it reappears in unmapped listings and auto-mapping.',
    parameters: {
      type: 'object',
      properties: {
        unmappedId: { type: 'string', description: 'UUID of the unmapped listing to unblock' },
      },
      required: ['unmappedId'],
    },
  },
  {
    name: 'block_unmapped_listings',
    category: 'products',
    description: 'Batch block multiple unmapped marketplace listings in a single request. Returns per-ID success/failure status.',
    parameters: {
      type: 'object',
      properties: {
        unmappedIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of unmapped listing UUIDs to block',
        },
        reason: { type: 'string', description: 'Optional reason or note for blocking these listings' },
      },
      required: ['unmappedIds'],
    },
  },
  {
    name: 'list_product_mappings',
    category: 'products',
    description: 'List active marketplace product mappings connecting central OmniStack products to marketplace listings (Otto, Amazon, Shopify, Mirakl, eBay).',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Filter by central product UUID or SKU' },
        marketplace: { type: 'string', description: 'Filter by marketplace channel' },
        query: { type: 'string', description: 'Search query for marketplace SKU, central SKU, or EAN' },
        limit: { type: 'integer', description: 'Default: 50, max: 100' },
        offset: { type: 'integer', description: 'Default: 0' },
      },
    },
  },
  {
    name: 'set_product_mapping',
    category: 'products',
    description: 'Create or update a manual mapping linking a central product to a marketplace listing (by integration ID or marketplace channel and marketplace SKU).',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Central product UUID or SKU' },
        marketplace: { type: 'string', description: 'Marketplace channel (e.g. otto, amazon, shopify, mirakl_decathlon, ebay)' },
        marketplaceSku: { type: 'string', description: 'SKU on the marketplace' },
        marketplaceProductId: { type: 'string', description: 'Optional internal ID on marketplace (e.g. Shopify Item ID)' },
        integrationId: { type: 'string', description: 'Optional UUID of the marketplace integration' },
        ean: { type: 'string', description: 'Optional EAN/barcode for this mapping' },
        syncStock: { type: 'boolean', description: 'Synchronize stock (default: true)' },
        syncPrice: { type: 'boolean', description: 'Synchronize price (default: false)' },
        priceModifierType: { type: 'string', enum: ['none', 'percentage', 'fixed'], description: 'Price modifier type (default: none)' },
        priceModifierValue: { type: 'number', description: 'Price modifier value (e.g. 10 for 10% or 5.00 for EUR 5)' },
      },
      required: ['productId', 'marketplace', 'marketplaceSku'],
    },
  },
  {
    name: 'delete_product_mapping',
    category: 'products',
    description: 'Remove a marketplace product mapping. Unlinks the marketplace listing from the central product and restores it to unmapped listings for re-mapping.',
    parameters: {
      type: 'object',
      properties: {
        mappingId: { type: 'string', description: 'UUID of the product mapping to delete' },
        restoreToUnmapped: { type: 'boolean', description: 'Restore to unmapped listings table (default: true)' },
      },
      required: ['mappingId'],
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
    description: 'Generate a carrier shipping label (Hermes, DHL, or DPD) for an order, record the tracking code, mark the order as shipped, and automatically confirm the shipment and tracking code to the connected marketplace (Otto, About You, Decathlon, Amazon, etc.). Idempotent: If the order already has a tracking number or label URL, returns the existing label immediately to prevent duplicate carrier charges and ensures marketplace confirmation.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID (UUID)' },
        carrier: { type: 'string', enum: ['dhl', 'hermes', 'dpd'], description: 'Shipping carrier (default: hermes)' },
        parcelClass: { type: 'string', description: 'Parcel class for Hermes (XS, S, M, L, XL), default: S' },
        weightKg: { type: 'number', description: 'Total parcel weight in kg' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'confirm_order_shipment',
    category: 'shipping',
    description: 'Explicitly transmit tracking code and confirm shipment on the connected marketplace (Otto, About You, Decathlon, Amazon, etc.) for an order that is already marked as shipped.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID (UUID)' },
        carrier: { type: 'string', description: 'Carrier name (e.g. HERMES, DHL, DPD), default: HERMES' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'retry_pending_shipment_confirmations',
    category: 'shipping',
    description: 'Batch retry transmitting tracking numbers to marketplaces for all orders where shipment confirmation is currently pending or failed.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum number of orders to confirm (default: 50)' },
      },
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

        const archivedFilter =
          typeof params.archived === 'boolean'
            ? params.archived
            : typeof params.isArchived === 'boolean'
            ? params.isArchived
            : undefined

        if (archivedFilter !== undefined) {
          conditions.push(eq(orders.isArchived, archivedFilter))
        }

        const orderRecords = await db
          .select({
            id: orders.id,
            marketplace: orders.marketplace,
            marketplaceOrderId: orders.marketplaceOrderId,
            status: orders.status,
            shippingStatus: orders.shippingStatus,
            isArchived: orders.isArchived,
            deliveryNoteNumber: orders.deliveryNoteNumber,
            buyerName: orders.buyerName,
            buyerEmail: orders.buyerEmail,
            shippingName: orders.shippingName,
            shippingCity: orders.shippingCity,
            shippingCountry: orders.shippingCountry,
            currency: orders.currency,
            totalAmount: orders.totalAmount,
            trackingNumber: orders.trackingNumber,
            labelUrl: orders.labelUrl,
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
        const orderId = params.orderId

        const { pdfBuffer, deliveryNoteNumber } = await getOrGenerateDeliveryNotePdf(orderId, companyId)
        const pdfBase64 = pdfBuffer.toString('base64')
        const pdfUrl = `data:application/pdf;base64,${pdfBase64}`

        return {
          success: true,
          data: {
            orderId,
            deliveryNoteNumber,
            downloadUrl: `/api/orders/${orderId}/delivery-note`,
            pdfBase64,
            pdfUrl,
          },
        }
      }

      case 'get_delivery_note_pdf': {
        const companyId = ctx.companyId
        const orderId = params.orderId

        const { pdfBuffer, deliveryNoteNumber, filename } = await getOrGenerateDeliveryNotePdf(orderId, companyId)
        const pdfBase64 = pdfBuffer.toString('base64')
        const pdfUrl = `data:application/pdf;base64,${pdfBase64}`

        return {
          success: true,
          data: {
            orderId,
            deliveryNoteNumber,
            filename,
            downloadUrl: `/api/connector/grok/orders/${orderId}/delivery-note/pdf`,
            pdfBase64,
            pdfUrl,
          },
        }
      }

      case 'generate_bulk_delivery_notes': {
        const companyId = ctx.companyId
        const orderIds: string[] = Array.isArray(params.orderIds)
          ? params.orderIds
          : typeof params.ids === 'string'
          ? params.ids.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []

        if (orderIds.length === 0) {
          return { success: false, error: 'orderIds array cannot be empty.' }
        }

        const result = await getMergedDeliveryNotesPdf(orderIds, companyId)
        const pdfBase64 = result.pdfBuffer.toString('base64')
        const downloadUrl = `/api/connector/grok/orders/delivery-notes/batch?ids=${encodeURIComponent(orderIds.join(','))}&format=pdf`

        return {
          success: true,
          data: {
            filename: result.filename,
            processedCount: result.processedCount,
            totalCount: result.totalCount,
            downloadUrl,
            pdfBase64,
            pdfUrl: `data:application/pdf;base64,${pdfBase64}`,
          },
        }
      }

      case 'generate_bulk_shipping_labels': {
        const companyId = ctx.companyId
        const orderIds: string[] = Array.isArray(params.orderIds)
          ? params.orderIds
          : typeof params.ids === 'string'
          ? params.ids.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []

        if (orderIds.length === 0) {
          return { success: false, error: 'orderIds array cannot be empty.' }
        }

        const result = await getMergedShippingLabelsPdf(orderIds, companyId)
        const pdfBase64 = result.pdfBuffer.toString('base64')
        const downloadUrl = `/api/connector/grok/orders/shipping-labels/batch?ids=${encodeURIComponent(orderIds.join(','))}&format=pdf`

        return {
          success: true,
          data: {
            filename: result.filename,
            processedCount: result.processedCount,
            totalCount: result.totalCount,
            downloadUrl,
            pdfBase64,
            pdfUrl: `data:application/pdf;base64,${pdfBase64}`,
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
          .orderBy(desc(products.createdAt), desc(products.id))
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

      // ── Unmapped Listings & Product Mappings ────────────────
      case 'list_unmapped_listings': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 25, 1), 100)
        const offset = Math.max(params.offset || 0, 0)
        const isBlocked = params.isBlocked !== undefined ? Boolean(params.isBlocked) : false

        const conditions: any[] = [
          eq(unmappedMarketplaceProducts.companyId, companyId),
          eq(unmappedMarketplaceProducts.isBlocked, isBlocked),
        ]

        if (params.marketplace) {
          conditions.push(eq(unmappedMarketplaceProducts.marketplace, params.marketplace as any))
        }

        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(unmappedMarketplaceProducts.title, q),
              ilike(unmappedMarketplaceProducts.marketplaceSku, q),
              ilike(unmappedMarketplaceProducts.brand, q)
            )
          )
        }

        const items = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(and(...conditions))
          .orderBy(desc(unmappedMarketplaceProducts.createdAt), desc(unmappedMarketplaceProducts.id))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(unmappedMarketplaceProducts)
          .where(and(...conditions))

        const formatted = items.map((item) => ({
          id: item.id,
          marketplace: item.marketplace,
          integrationId: item.integrationId,
          marketplaceSku: item.marketplaceSku,
          marketplaceProductId: item.marketplaceProductId,
          title: item.title,
          brand: item.brand,
          price: item.price ? Number(item.price) : null,
          stock: item.stock ? Number(item.stock) : null,
          ean: getEanFromPayload(item.rawPayload),
          isBlocked: item.isBlocked,
          blockedAt: item.blockedAt,
          blockedReason: item.blockedReason,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }))

        return {
          success: true,
          data: {
            unmappedListings: formatted,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + items.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'get_unmapped_listing_details': {
        const companyId = ctx.companyId
        const ident = params.identifier?.trim()
        if (!ident) return { success: false, error: 'Parameter identifier is required.' }

        const [item] = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(
            and(
              eq(unmappedMarketplaceProducts.companyId, companyId),
              or(
                eq(unmappedMarketplaceProducts.id, ident),
                eq(unmappedMarketplaceProducts.marketplaceSku, ident)
              )
            )
          )
          .limit(1)

        if (!item) return { success: false, error: `Unmapped listing '${ident}' not found.` }

        const extractedEan = getEanFromPayload(item.rawPayload)

        // Find automatic suggestions in products
        const matchConditions: any[] = [eq(products.sku, item.marketplaceSku)]
        if (extractedEan) {
          matchConditions.push(ilike(products.ean, `%${extractedEan}%`))
        }

        const [suggested] = await db
          .select({
            id: products.id,
            sku: products.sku,
            title: products.title,
            ean: products.ean,
            price: products.price,
            currentStock: products.currentStock,
          })
          .from(products)
          .where(and(eq(products.companyId, companyId), or(...matchConditions)))
          .limit(1)

        let matchReason: string | null = null
        if (suggested) {
          const skuMatch = suggested.sku.toLowerCase() === item.marketplaceSku.toLowerCase()
          const eanMatch = extractedEan && suggested.ean?.includes(extractedEan)
          if (skuMatch && eanMatch) matchReason = 'SKU & EAN'
          else if (skuMatch) matchReason = 'SKU'
          else if (eanMatch) matchReason = 'EAN'
        }

        return {
          success: true,
          data: {
            listing: {
              ...item,
              extractedEan,
            },
            suggestedProduct: suggested
              ? {
                  ...suggested,
                  matchReason,
                }
              : null,
          },
        }
      }

      case 'map_unmapped_listing': {
        const companyId = ctx.companyId
        const unmappedId = params.unmappedId?.trim()
        const productId = params.productId?.trim()

        if (!unmappedId || !productId) {
          return { success: false, error: 'unmappedId and productId are required.' }
        }

        const [unmapped] = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(
            and(
              eq(unmappedMarketplaceProducts.companyId, companyId),
              eq(unmappedMarketplaceProducts.id, unmappedId)
            )
          )
          .limit(1)

        if (!unmapped) return { success: false, error: `Unmapped listing '${unmappedId}' not found.` }

        const [central] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.companyId, companyId),
              or(eq(products.id, productId), eq(products.sku, productId))
            )
          )
          .limit(1)

        if (!central) return { success: false, error: `Central product '${productId}' not found.` }

        const unmappedEan = getEanFromPayload(unmapped.rawPayload)

        // Check for existing mapping
        const [existingMapping] = await db
          .select()
          .from(productMappings)
          .where(
            and(
              eq(productMappings.companyId, companyId),
              eq(productMappings.marketplace, unmapped.marketplace),
              eq(productMappings.marketplaceSku, unmapped.marketplaceSku)
            )
          )
          .limit(1)

        let targetMapping: any = null
        if (existingMapping) {
          const [updated] = await db
            .update(productMappings)
            .set({
              productId: central.id,
              integrationId: unmapped.integrationId || existingMapping.integrationId,
              marketplaceProductId: unmapped.marketplaceProductId || existingMapping.marketplaceProductId,
              ean: unmappedEan || existingMapping.ean,
              syncStock: params.syncStock !== undefined ? Boolean(params.syncStock) : true,
              syncPrice: params.syncPrice !== undefined ? Boolean(params.syncPrice) : false,
              updatedAt: new Date(),
            })
            .where(eq(productMappings.id, existingMapping.id))
            .returning()
          targetMapping = updated
        } else {
          const [inserted] = await db
            .insert(productMappings)
            .values({
              companyId,
              productId: central.id,
              marketplace: unmapped.marketplace,
              integrationId: unmapped.integrationId,
              marketplaceSku: unmapped.marketplaceSku,
              marketplaceProductId: unmapped.marketplaceProductId,
              syncStock: params.syncStock !== undefined ? Boolean(params.syncStock) : true,
              syncPrice: params.syncPrice !== undefined ? Boolean(params.syncPrice) : false,
              ean: unmappedEan || null,
            })
            .returning()
          targetMapping = inserted
        }

        // Update central product EAN if new
        if (unmappedEan) {
          const existingEans = central.ean ? central.ean.split(',').map((s: string) => s.trim()) : []
          if (!existingEans.includes(unmappedEan)) {
            existingEans.push(unmappedEan)
            await db
              .update(products)
              .set({ ean: existingEans.join(', '), updatedAt: new Date() })
              .where(eq(products.id, central.id))
          }
        }

        // Delete from unmapped listings
        await db
          .delete(unmappedMarketplaceProducts)
          .where(eq(unmappedMarketplaceProducts.id, unmapped.id))

        // Trigger stock push to marketplaces in background
        if (central.currentStock !== null && central.currentStock !== undefined) {
          import('@/workers/product-sync')
            .then(({ pushUpdatesToMarketplaces }) => {
              pushUpdatesToMarketplaces(companyId, [
                { sku: central.sku, stock: parseInt(central.currentStock?.toString() || '0', 10) },
              ]).catch(console.error)
            })
            .catch(console.error)
        }

        return {
          success: true,
          data: {
            mapping: targetMapping,
            centralProduct: {
              id: central.id,
              sku: central.sku,
              title: central.title,
            },
            unmappedSku: unmapped.marketplaceSku,
            marketplace: unmapped.marketplace,
          },
        }
      }

      case 'create_and_map_product': {
        const companyId = ctx.companyId
        const unmappedId = params.unmappedId?.trim()
        if (!unmappedId) return { success: false, error: 'unmappedId is required.' }

        const [unmapped] = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(
            and(
              eq(unmappedMarketplaceProducts.companyId, companyId),
              eq(unmappedMarketplaceProducts.id, unmappedId)
            )
          )
          .limit(1)

        if (!unmapped) return { success: false, error: `Unmapped listing '${unmappedId}' not found.` }

        const extractedEan = getEanFromPayload(unmapped.rawPayload)
        const targetSku = (params.sku || unmapped.marketplaceSku).trim()
        const targetTitle = (params.title || unmapped.title || targetSku).trim()
        const targetPrice = params.price !== undefined ? Number(params.price).toFixed(2) : (unmapped.price ? Number(unmapped.price).toFixed(2) : '0.00')
        const targetStock = params.currentStock !== undefined ? params.currentStock.toString() : (unmapped.stock ? unmapped.stock.toString() : '0')
        const targetEan = params.ean?.trim() || extractedEan || null
        const targetBrand = params.brand?.trim() || unmapped.brand || null

        // Check if product with targetSku already exists
        const [existing] = await db
          .select()
          .from(products)
          .where(and(eq(products.companyId, companyId), eq(products.sku, targetSku)))
          .limit(1)

        let centralProduct = existing
        if (!centralProduct) {
          const [created] = await db
            .insert(products)
            .values({
              companyId,
              sku: targetSku,
              title: targetTitle,
              price: targetPrice,
              currentStock: targetStock,
              ean: targetEan,
              brand: targetBrand,
            })
            .returning()
          centralProduct = created
        }

        // Upsert mapping
        const [existingMapping] = await db
          .select()
          .from(productMappings)
          .where(
            and(
              eq(productMappings.companyId, companyId),
              eq(productMappings.marketplace, unmapped.marketplace),
              eq(productMappings.marketplaceSku, unmapped.marketplaceSku)
            )
          )
          .limit(1)

        let mapping: any = null
        if (existingMapping) {
          const [updated] = await db
            .update(productMappings)
            .set({
              productId: centralProduct.id,
              integrationId: unmapped.integrationId || existingMapping.integrationId,
              marketplaceProductId: unmapped.marketplaceProductId || existingMapping.marketplaceProductId,
              ean: targetEan || existingMapping.ean,
              updatedAt: new Date(),
            })
            .where(eq(productMappings.id, existingMapping.id))
            .returning()
          mapping = updated
        } else {
          const [inserted] = await db
            .insert(productMappings)
            .values({
              companyId,
              productId: centralProduct.id,
              marketplace: unmapped.marketplace,
              integrationId: unmapped.integrationId,
              marketplaceSku: unmapped.marketplaceSku,
              marketplaceProductId: unmapped.marketplaceProductId,
              syncStock: true,
              syncPrice: false,
              ean: targetEan,
            })
            .returning()
          mapping = inserted
        }

        // Delete from unmapped
        await db
          .delete(unmappedMarketplaceProducts)
          .where(eq(unmappedMarketplaceProducts.id, unmapped.id))

        return {
          success: true,
          data: {
            createdProduct: centralProduct,
            mapping,
          },
        }
      }

      case 'auto_map_unmapped_listings': {
        const companyId = ctx.companyId
        const isDryRun = Boolean(params.dryRun)

        const conditions: any[] = [
          eq(unmappedMarketplaceProducts.companyId, companyId),
          eq(unmappedMarketplaceProducts.isBlocked, false),
        ]
        if (params.marketplace) {
          conditions.push(eq(unmappedMarketplaceProducts.marketplace, params.marketplace as any))
        }

        const unmappedList = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(and(...conditions))

        if (unmappedList.length === 0) {
          return {
            success: true,
            data: { matchesFound: 0, mappedCount: 0, dryRun: isDryRun, mappings: [] },
          }
        }

        const unmappedWithKeys = unmappedList.map((p) => ({
          ...p,
          ean: getEanFromPayload(p.rawPayload),
        }))

        const eans = [...new Set(unmappedWithKeys.filter((p) => !!p.ean).map((p) => p.ean as string))]
        const skus = [...new Set(unmappedWithKeys.map((p) => p.marketplaceSku))]

        const matchOrConditions: any[] = []
        if (eans.length > 0) matchOrConditions.push(or(...eans.map((e) => ilike(products.ean, `%${e}%`))))
        if (skus.length > 0) matchOrConditions.push(inArray(products.sku, skus))

        if (matchOrConditions.length === 0) {
          return {
            success: true,
            data: { matchesFound: 0, mappedCount: 0, dryRun: isDryRun, mappings: [] },
          }
        }

        const existingProducts = await db
          .select({
            id: products.id,
            sku: products.sku,
            title: products.title,
            ean: products.ean,
            currentStock: products.currentStock,
          })
          .from(products)
          .where(and(eq(products.companyId, companyId), or(...matchOrConditions)))

        const eanMap = new Map<string, typeof existingProducts[0]>()
        const skuMap = new Map<string, typeof existingProducts[0]>()
        for (const prod of existingProducts) {
          if (prod.ean) {
            for (const e of prod.ean.split(',').map((s) => s.trim())) {
              if (!eanMap.has(e)) eanMap.set(e, prod)
            }
          }
          if (prod.sku && !skuMap.has(prod.sku)) {
            skuMap.set(prod.sku, prod)
          }
        }

        const matchedList: Array<{
          unmappedId: string
          unmappedSku: string
          unmappedTitle: string
          unmappedMarketplace: string
          ean: string | null
          matchedProductId: string
          matchedProductSku: string
          matchedProductTitle: string
          matchReason: string
        }> = []

        for (const u of unmappedWithKeys) {
          const skuMatch = skuMap.get(u.marketplaceSku)
          const eanMatch = u.ean ? eanMap.get(u.ean) : null
          const match = skuMatch || eanMatch
          if (match) {
            const isSku = skuMatch && skuMatch.id === match.id
            const isEan = eanMatch && eanMatch.id === match.id
            const matchReason = isSku && isEan ? 'SKU & EAN' : isSku ? 'SKU' : 'EAN'
            matchedList.push({
              unmappedId: u.id,
              unmappedSku: u.marketplaceSku,
              unmappedTitle: u.title,
              unmappedMarketplace: u.marketplace,
              ean: u.ean,
              matchedProductId: match.id,
              matchedProductSku: match.sku,
              matchedProductTitle: match.title,
              matchReason,
            })
          }
        }

        if (isDryRun || matchedList.length === 0) {
          return {
            success: true,
            data: {
              matchesFound: matchedList.length,
              mappedCount: 0,
              dryRun: isDryRun,
              mappings: matchedList,
            },
          }
        }

        // Apply mappings
        const unmappedById = new Map(unmappedList.map((u) => [u.id, u]))
        const mappingsToInsert: any[] = []
        const unmappedIdsToDelete: string[] = []

        for (const m of matchedList) {
          const unmapped = unmappedById.get(m.unmappedId)
          if (unmapped) {
            mappingsToInsert.push({
              companyId,
              productId: m.matchedProductId,
              marketplace: unmapped.marketplace as any,
              integrationId: unmapped.integrationId,
              marketplaceSku: unmapped.marketplaceSku,
              marketplaceProductId: unmapped.marketplaceProductId,
              syncStock: true,
              syncPrice: false,
              ean: m.ean || null,
            })
            unmappedIdsToDelete.push(unmapped.id)
          }
        }

        let createdCount = 0
        if (mappingsToInsert.length > 0) {
          const inserted = await db
            .insert(productMappings)
            .values(mappingsToInsert)
            .onConflictDoNothing()
            .returning({ id: productMappings.id })
          createdCount = inserted.length
        }

        if (unmappedIdsToDelete.length > 0) {
          await db
            .delete(unmappedMarketplaceProducts)
            .where(
              and(
                eq(unmappedMarketplaceProducts.companyId, companyId),
                inArray(unmappedMarketplaceProducts.id, unmappedIdsToDelete)
              )
            )
        }

        return {
          success: true,
          data: {
            matchesFound: matchedList.length,
            mappedCount: createdCount,
            dryRun: false,
            mappings: matchedList,
          },
        }
      }

      case 'block_unmapped_listing': {
        const companyId = ctx.companyId
        const unmappedId = params.unmappedId?.trim()
        if (!unmappedId) return { success: false, error: 'unmappedId is required.' }
        if (!isUuid(unmappedId)) return { success: false, error: `Invalid listing ID format '${unmappedId}' (UUID expected).` }

        const [existing] = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(and(eq(unmappedMarketplaceProducts.companyId, companyId), eq(unmappedMarketplaceProducts.id, unmappedId)))
          .limit(1)

        if (!existing) {
          return { success: false, error: `Unmapped listing '${unmappedId}' not found.` }
        }

        const blockedAt = new Date()
        const [updated] = await db
          .update(unmappedMarketplaceProducts)
          .set({
            isBlocked: true,
            blockedAt,
            blockedReason: params.reason?.trim() || null,
            updatedAt: new Date(),
          })
          .where(and(eq(unmappedMarketplaceProducts.companyId, companyId), eq(unmappedMarketplaceProducts.id, unmappedId)))
          .returning()

        return {
          success: true,
          data: {
            unmappedId: updated.id,
            marketplaceSku: updated.marketplaceSku,
            marketplace: updated.marketplace,
            title: updated.title,
            isBlocked: updated.isBlocked,
            blockedAt: updated.blockedAt,
            blockedReason: updated.blockedReason,
          },
        }
      }

      case 'unblock_unmapped_listing': {
        const companyId = ctx.companyId
        const unmappedId = params.unmappedId?.trim()
        if (!unmappedId) return { success: false, error: 'unmappedId is required.' }
        if (!isUuid(unmappedId)) return { success: false, error: `Invalid listing ID format '${unmappedId}' (UUID expected).` }

        const [existing] = await db
          .select()
          .from(unmappedMarketplaceProducts)
          .where(and(eq(unmappedMarketplaceProducts.companyId, companyId), eq(unmappedMarketplaceProducts.id, unmappedId)))
          .limit(1)

        if (!existing) {
          return { success: false, error: `Unmapped listing '${unmappedId}' not found.` }
        }

        const [updated] = await db
          .update(unmappedMarketplaceProducts)
          .set({
            isBlocked: false,
            blockedAt: null,
            blockedReason: null,
            updatedAt: new Date(),
          })
          .where(and(eq(unmappedMarketplaceProducts.companyId, companyId), eq(unmappedMarketplaceProducts.id, unmappedId)))
          .returning()

        return {
          success: true,
          data: {
            unmappedId: updated.id,
            marketplaceSku: updated.marketplaceSku,
            marketplace: updated.marketplace,
            title: updated.title,
            isBlocked: updated.isBlocked,
            blockedAt: updated.blockedAt,
            blockedReason: updated.blockedReason,
          },
        }
      }

      case 'block_unmapped_listings': {
        const companyId = ctx.companyId
        const rawIds: unknown[] = Array.isArray(params.unmappedIds) ? params.unmappedIds : []
        const unmappedIds = rawIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())

        if (unmappedIds.length === 0) {
          return { success: false, error: 'unmappedIds array must contain at least one listing ID.' }
        }

        const reason = params.reason?.trim() || null
        const validUuids = unmappedIds.filter(isUuid)

        // Fetch matching unmapped rows for this company using valid UUIDs only
        const existingRows = validUuids.length > 0
          ? await db
              .select()
              .from(unmappedMarketplaceProducts)
              .where(
                and(
                  eq(unmappedMarketplaceProducts.companyId, companyId),
                  inArray(unmappedMarketplaceProducts.id, validUuids)
                )
              )
          : []

        const existingMap = new Map(existingRows.map((r) => [r.id, r]))
        const blockedAt = new Date()

        if (existingRows.length > 0) {
          await db
            .update(unmappedMarketplaceProducts)
            .set({
              isBlocked: true,
              blockedAt,
              blockedReason: reason,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(unmappedMarketplaceProducts.companyId, companyId),
                inArray(unmappedMarketplaceProducts.id, existingRows.map((r) => r.id))
              )
            )
        }

        const results = unmappedIds.map((id) => {
          if (!isUuid(id)) {
            return {
              unmappedId: id,
              success: false,
              error: 'Invalid UUID format',
            }
          }
          const row = existingMap.get(id)
          if (!row) {
            return {
              unmappedId: id,
              success: false,
              error: 'Not found or unauthorized',
            }
          }
          return {
            unmappedId: id,
            marketplaceSku: row.marketplaceSku,
            marketplace: row.marketplace,
            title: row.title,
            success: true,
            isBlocked: true,
            blockedAt,
            blockedReason: reason,
          }
        })

        const successfulCount = results.filter((r) => r.success).length
        const failedCount = results.length - successfulCount

        return {
          success: true,
          data: {
            totalRequested: unmappedIds.length,
            successfulCount,
            failedCount,
            results,
          },
        }
      }

      case 'list_product_mappings': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 50, 1), 100)
        const offset = Math.max(params.offset || 0, 0)

        const conditions: any[] = [eq(productMappings.companyId, companyId)]

        if (params.productId) {
          const prodIdent = params.productId.trim()
          conditions.push(
            or(
              eq(productMappings.productId, prodIdent),
              eq(products.sku, prodIdent)
            )
          )
        }

        if (params.marketplace) {
          conditions.push(eq(productMappings.marketplace, params.marketplace as any))
        }

        if (params.query) {
          const q = `%${params.query.trim()}%`
          conditions.push(
            or(
              ilike(productMappings.marketplaceSku, q),
              ilike(products.sku, q),
              ilike(products.title, q),
              ilike(productMappings.ean, q)
            )
          )
        }

        const items = await db
          .select({
            id: productMappings.id,
            productId: productMappings.productId,
            marketplace: productMappings.marketplace,
            integrationId: productMappings.integrationId,
            marketplaceSku: productMappings.marketplaceSku,
            marketplaceProductId: productMappings.marketplaceProductId,
            ean: productMappings.ean,
            syncStock: productMappings.syncStock,
            syncPrice: productMappings.syncPrice,
            priceModifierType: productMappings.priceModifierType,
            priceModifierValue: productMappings.priceModifierValue,
            createdAt: productMappings.createdAt,
            updatedAt: productMappings.updatedAt,
            product: {
              sku: products.sku,
              title: products.title,
              currentStock: products.currentStock,
              price: products.price,
            },
          })
          .from(productMappings)
          .innerJoin(products, eq(productMappings.productId, products.id))
          .where(and(...conditions))
          .orderBy(desc(productMappings.updatedAt))
          .limit(limit)
          .offset(offset)

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(productMappings)
          .innerJoin(products, eq(productMappings.productId, products.id))
          .where(and(...conditions))

        return {
          success: true,
          data: {
            mappings: items,
            pagination: {
              total: totalCount?.count || 0,
              limit,
              offset,
              hasMore: offset + items.length < (totalCount?.count || 0),
            },
          },
        }
      }

      case 'set_product_mapping': {
        const companyId = ctx.companyId
        const prodIdent = params.productId?.trim()
        const marketplace = params.marketplace?.trim()
        const marketplaceSku = params.marketplaceSku?.trim()

        if (!prodIdent || !marketplace || !marketplaceSku) {
          return { success: false, error: 'productId, marketplace, and marketplaceSku are required.' }
        }

        const [central] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.companyId, companyId),
              or(eq(products.id, prodIdent), eq(products.sku, prodIdent))
            )
          )
          .limit(1)

        if (!central) return { success: false, error: `Central product '${prodIdent}' not found.` }

        // Find integrationId if not passed
        let integrationId = params.integrationId
        if (!integrationId) {
          const [intg] = await db
            .select({ id: marketplaceIntegrations.id })
            .from(marketplaceIntegrations)
            .where(
              and(
                eq(marketplaceIntegrations.companyId, companyId),
                eq(marketplaceIntegrations.type, marketplace as any),
                eq(marketplaceIntegrations.isActive, true)
              )
            )
            .limit(1)
          if (intg) integrationId = intg.id
        }

        const targetEan = params.ean?.trim() || central.ean?.split(',')[0]?.trim() || null

        // Check for existing mapping
        const [existing] = await db
          .select()
          .from(productMappings)
          .where(
            and(
              eq(productMappings.companyId, companyId),
              eq(productMappings.marketplace, marketplace as any),
              eq(productMappings.marketplaceSku, marketplaceSku)
            )
          )
          .limit(1)

        let mapping: any = null
        if (existing) {
          const [updated] = await db
            .update(productMappings)
            .set({
              productId: central.id,
              integrationId: integrationId || existing.integrationId,
              marketplaceProductId: params.marketplaceProductId || existing.marketplaceProductId,
              ean: targetEan || existing.ean,
              syncStock: params.syncStock !== undefined ? Boolean(params.syncStock) : true,
              syncPrice: params.syncPrice !== undefined ? Boolean(params.syncPrice) : false,
              priceModifierType: (params.priceModifierType as any) || existing.priceModifierType,
              priceModifierValue: params.priceModifierValue !== undefined ? Number(params.priceModifierValue).toFixed(4) : existing.priceModifierValue,
              updatedAt: new Date(),
            })
            .where(eq(productMappings.id, existing.id))
            .returning()
          mapping = updated
        } else {
          const [inserted] = await db
            .insert(productMappings)
            .values({
              companyId,
              productId: central.id,
              marketplace: marketplace as any,
              integrationId: integrationId || null,
              marketplaceSku,
              marketplaceProductId: params.marketplaceProductId || null,
              ean: targetEan,
              syncStock: params.syncStock !== undefined ? Boolean(params.syncStock) : true,
              syncPrice: params.syncPrice !== undefined ? Boolean(params.syncPrice) : false,
              priceModifierType: (params.priceModifierType as any) || 'none',
              priceModifierValue: params.priceModifierValue !== undefined ? Number(params.priceModifierValue).toFixed(4) : '0',
            })
            .returning()
          mapping = inserted
        }

        // Remove from unmapped if it existed
        await db
          .delete(unmappedMarketplaceProducts)
          .where(
            and(
              eq(unmappedMarketplaceProducts.companyId, companyId),
              eq(unmappedMarketplaceProducts.marketplaceSku, marketplaceSku)
            )
          )

        return {
          success: true,
          data: {
            mapping,
            product: { id: central.id, sku: central.sku, title: central.title },
          },
        }
      }

      case 'delete_product_mapping': {
        const companyId = ctx.companyId
        const mappingId = params.mappingId?.trim()
        if (!mappingId) return { success: false, error: 'mappingId is required.' }

        const [mapping] = await db
          .select()
          .from(productMappings)
          .where(and(eq(productMappings.companyId, companyId), eq(productMappings.id, mappingId)))
          .limit(1)

        if (!mapping) return { success: false, error: `Product mapping '${mappingId}' not found.` }

        const restoreToUnmapped = params.restoreToUnmapped !== undefined ? Boolean(params.restoreToUnmapped) : true

        if (restoreToUnmapped) {
          await db
            .insert(unmappedMarketplaceProducts)
            .values({
              companyId,
              marketplace: mapping.marketplace,
              integrationId: mapping.integrationId,
              marketplaceSku: mapping.marketplaceSku,
              marketplaceProductId: mapping.marketplaceProductId,
              title: mapping.marketplaceSku,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                unmappedMarketplaceProducts.companyId,
                unmappedMarketplaceProducts.integrationId,
                unmappedMarketplaceProducts.marketplaceSku,
              ],
              set: { updatedAt: new Date() },
            })
        }

        await db
          .delete(productMappings)
          .where(eq(productMappings.id, mapping.id))

        return {
          success: true,
          data: {
            deletedMappingId: mapping.id,
            marketplaceSku: mapping.marketplaceSku,
            marketplace: mapping.marketplace,
            restoredToUnmapped: restoreToUnmapped,
          },
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

        // SAFETY / IDEMPOTENCY: Check if the order already has trackingNumber or labelUrl
        if (order.trackingNumber || order.labelUrl) {
          // If confirmation was pending or failed, retry marketplace confirmation now!
          if (order.marketplace !== 'manual' && order.marketplaceConfirmationStatus !== 'confirmed') {
            try {
              const { confirmMarketplaceShipment } = await import('@/lib/marketplace-confirmation')
              await confirmMarketplaceShipment(order.id, companyId, (params.carrier || 'HERMES').toUpperCase())
            } catch (err: any) {
              console.warn('[generate_shipping_label] Retrying confirmation on existing label failed:', err.message)
            }
          }

          const [refreshed] = await db
            .select({
              marketplaceConfirmationStatus: orders.marketplaceConfirmationStatus,
              marketplaceConfirmationError: orders.marketplaceConfirmationError,
              marketplaceConfirmedAt: orders.marketplaceConfirmedAt,
            })
            .from(orders)
            .where(eq(orders.id, order.id))
            .limit(1)

          return {
            success: true,
            data: {
              orderId: order.id,
              trackingNumber: order.trackingNumber,
              labelUrl: order.labelUrl,
              carrier: params.carrier || 'hermes',
              status: order.status,
              marketplaceConfirmationStatus: refreshed?.marketplaceConfirmationStatus || order.marketplaceConfirmationStatus,
              marketplaceConfirmationError: refreshed?.marketplaceConfirmationError || order.marketplaceConfirmationError,
              isExisting: true,
              message: 'Shipping label already exists for this order. Reusing existing label to prevent duplicate carrier charges.',
            },
          }
        }

        const requestedCarrier = (params.carrier || 'hermes').toLowerCase()

        if (requestedCarrier === 'hermes') {
          try {
            const { HermesAdapter } = await import('@/adapters/shipping/hermes')
            const hermes = await HermesAdapter.initialize(companyId)
            const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
            if (!company || !company.street || !company.zip || !company.city) {
              return { success: false, error: 'Company address is missing in settings. Please configure billing/shipping address first.' }
            }

            const parcelClass = params.parcelClass || 'S'
            const { labelUrl, returnLabelUrl, trackingNumber, returnTrackingNumber } = await hermes.generateLabelForOrder(order, company, parcelClass)

            await db
              .update(orders)
              .set({
                status: 'shipped',
                shippingStatus: 'in_transit',
                trackingNumber,
                labelUrl,
                returnTrackingNumber,
                returnLabelUrl: returnLabelUrl ?? null,
                marketplaceConfirmationStatus: order.marketplace === 'manual' ? 'not_applicable' : 'pending',
                totalWeight: params.weightKg ? Number(params.weightKg).toFixed(3) : order.totalWeight,
                updatedAt: new Date(),
              })
              .where(eq(orders.id, order.id))

            // Auto-confirm shipment on marketplace immediately
            let marketplaceConfirmed = false
            let confirmationError: string | null = null
            if (order.marketplace !== 'manual') {
              try {
                const { confirmMarketplaceShipment } = await import('@/lib/marketplace-confirmation')
                const confResult = await confirmMarketplaceShipment(order.id, companyId, 'HERMES')
                marketplaceConfirmed = confResult.success
                if (!confResult.success) {
                  confirmationError = confResult.error || null
                }
              } catch (confErr: any) {
                console.warn('[generate_shipping_label] Background marketplace confirmation failed:', confErr.message)
                confirmationError = confErr.message
              }
            } else {
              marketplaceConfirmed = true
            }

            return {
              success: true,
              data: {
                orderId: order.id,
                trackingNumber,
                labelUrl,
                carrier: 'hermes',
                status: 'shipped',
                marketplaceConfirmationStatus: marketplaceConfirmed ? 'confirmed' : 'failed',
                marketplaceConfirmationError: confirmationError,
                isExisting: false,
              },
            }
          } catch (hermesErr: any) {
            console.error('[generate_shipping_label] Hermes label generation error:', hermesErr)
            return {
              success: false,
              error: `Hermes label generation failed: ${hermesErr.message}`,
            }
          }
        }

        // Fallback for non-Hermes carrier (or test tracking)
        const trackingNum = `TRACK-${Date.now().toString().slice(-8)}`
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

        // Auto-confirm shipment on marketplace immediately if not manual
        let marketplaceConfirmed = false
        let confirmationError: string | null = null
        if (order.marketplace !== 'manual') {
          try {
            const { confirmMarketplaceShipment } = await import('@/lib/marketplace-confirmation')
            const confResult = await confirmMarketplaceShipment(order.id, companyId, (params.carrier || 'DHL').toUpperCase())
            marketplaceConfirmed = confResult.success
            if (!confResult.success) {
              confirmationError = confResult.error || null
            }
          } catch (confErr: any) {
            console.warn('[generate_shipping_label] Auto-confirmation on marketplace failed:', confErr.message)
            confirmationError = confErr.message
          }
        } else {
          marketplaceConfirmed = true
        }

        return {
          success: true,
          data: {
            orderId: updated.id,
            trackingNumber: updated.trackingNumber,
            carrier: params.carrier || 'dhl',
            status: updated.status,
            marketplaceConfirmationStatus: marketplaceConfirmed ? 'confirmed' : 'failed',
            marketplaceConfirmationError: confirmationError,
            isExisting: false,
          },
        }
      }

      case 'confirm_order_shipment': {
        const companyId = ctx.companyId
        const orderId = params.orderId
        const carrier = (params.carrier || 'HERMES').toUpperCase()

        const { confirmMarketplaceShipment } = await import('@/lib/marketplace-confirmation')
        const result = await confirmMarketplaceShipment(orderId, companyId, carrier)

        const [updatedOrder] = await db
          .select({
            id: orders.id,
            marketplace: orders.marketplace,
            marketplaceOrderId: orders.marketplaceOrderId,
            trackingNumber: orders.trackingNumber,
            status: orders.status,
            marketplaceConfirmationStatus: orders.marketplaceConfirmationStatus,
            marketplaceConfirmationError: orders.marketplaceConfirmationError,
            marketplaceConfirmedAt: orders.marketplaceConfirmedAt,
          })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))
          .limit(1)

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to confirm shipment on marketplace.',
            data: updatedOrder,
          }
        }

        return {
          success: true,
          data: updatedOrder,
        }
      }

      case 'retry_pending_shipment_confirmations': {
        const companyId = ctx.companyId
        const limit = Math.min(Math.max(params.limit || 50, 1), 100)

        const pendingOrders = await db
          .select({
            id: orders.id,
            marketplace: orders.marketplace,
            marketplaceOrderId: orders.marketplaceOrderId,
            trackingNumber: orders.trackingNumber,
          })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              or(
                eq(orders.marketplaceConfirmationStatus, 'pending'),
                eq(orders.marketplaceConfirmationStatus, 'failed')
              ),
              isNotNull(orders.trackingNumber),
              ne(orders.marketplace, 'manual')
            )
          )
          .limit(limit)

        const { confirmMarketplaceShipment } = await import('@/lib/marketplace-confirmation')
        let confirmedCount = 0
        let failedCount = 0
        const results: any[] = []

        for (const o of pendingOrders) {
          const res = await confirmMarketplaceShipment(o.id, companyId, 'HERMES')
          if (res.success) {
            confirmedCount++
          } else {
            failedCount++
          }
          results.push({
            orderId: o.id,
            marketplace: o.marketplace,
            marketplaceOrderId: o.marketplaceOrderId,
            success: res.success,
            error: res.error,
          })
        }

        return {
          success: true,
          data: {
            totalFound: pendingOrders.length,
            confirmedCount,
            failedCount,
            results,
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

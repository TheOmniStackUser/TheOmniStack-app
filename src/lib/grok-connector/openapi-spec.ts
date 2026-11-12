import { TOOLS_MANIFEST } from './tools'

export function getOpenApiSpec(baseUrl: string = 'https://theomnistack.de') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'TheOmniStack Grok Bot Connector API',
      version: '1.0.0',
      description:
        'Official Grok Bot & xAI Autonomous Agent Connector for TheOmniStack. Enables full multi-channel e-commerce orchestration, GoBD invoice issuance, inventory/stock control, order tracking, shipping label creation, returns inspection, and live financial metrics.',
      contact: {
        name: 'TheOmniStack Support',
        url: 'https://theomnistack.de',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'OmniStack Production Server',
      },
    ],
    security: [
      { BearerAuth: [] },
      { ApiKeyAuth: [] },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Provide your OmniStack personal or company API key as Bearer token.',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Provide your OmniStack personal or company API key in the x-api-key header.',
        },
      },
      schemas: {
        StandardSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
        StandardErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        ExecuteToolRequest: {
          type: 'object',
          required: ['tool'],
          properties: {
            tool: {
              type: 'string',
              description: 'The name of the tool to execute',
              enum: TOOLS_MANIFEST.map((t) => t.name),
            },
            parameters: {
              type: 'object',
              description: 'Parameters required by the tool',
            },
          },
        },
      },
    },
    paths: {
      '/api/connector/grok/execute': {
        post: {
          summary: 'Universal Tool Executor',
          description:
            'Universal entrypoint allowing Grok Bot to invoke ANY tool with a single JSON request. Perfect for LLM function calling.',
          operationId: 'executeTool',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExecuteToolRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tool execution result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardSuccessResponse' },
                },
              },
            },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/connector/grok/tools': {
        get: {
          summary: 'List Available Tools',
          description: 'Returns the catalog of all tools in standard OpenAI / Grok function-calling schema.',
          operationId: 'listTools',
          responses: {
            '200': {
              description: 'Manifest of tools',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tools: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/connector/grok/analytics': {
        get: {
          summary: 'Get Real-Time Business Analytics',
          description: 'Returns live revenue, order volume, pending shipments, returns, and low stock warnings.',
          operationId: 'getAnalytics',
          responses: {
            '200': {
              description: 'Analytics summary',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } },
            },
          },
        },
      },
      '/api/connector/grok/orders': {
        get: {
          summary: 'List Orders',
          description: 'List and filter orders with pagination, status, marketplace, and search queries.',
          operationId: 'listOrders',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'marketplace', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'archived', in: 'query', schema: { type: 'boolean' }, description: 'Filter by archived status (e.g. false for open orders)' },
            { name: 'isArchived', in: 'query', schema: { type: 'boolean' }, description: 'Alias for archived (e.g. false for open orders)' },
          ],
          responses: {
            '200': {
              description: 'List of orders',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } },
            },
          },
        },
      },
      '/api/connector/grok/orders/{id}': {
        get: {
          summary: 'Get Order Details',
          description: 'Get full details of a specific order including items, delivery addresses, and invoice link.',
          operationId: 'getOrderDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Detailed order',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } },
            },
          },
        },
      },
      '/api/connector/grok/orders/{id}/status': {
        post: {
          summary: 'Update Order Status',
          description: 'Update status of order (e.g. pending, processing, invoiced, shipped, cancelled, later_shipment).',
          operationId: 'updateOrderStatus',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['draft', 'pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/{id}/invoice': {
        post: {
          summary: 'Generate Order Invoice',
          description: 'Issues a GoBD-compliant PDF invoice for the specified order and stores it permanently.',
          operationId: 'generateOrderInvoice',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { customText: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/{id}/delivery-note': {
        get: {
          summary: 'Get Delivery Note Info & Base64',
          description: 'Retrieve delivery note metadata, base64 payload, and download URL for an order.',
          operationId: 'getDeliveryNote',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        post: {
          summary: 'Generate Delivery Note',
          description: 'Creates or reuses a delivery note number and retrieves download path, base64 PDF, and data URL. Reuses existing delivery note numbers idempotently.',
          operationId: 'generateDeliveryNote',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/{id}/delivery-note/pdf': {
        get: {
          summary: 'Download Delivery Note PDF',
          description: 'Stream the official GoBD delivery note as raw application/pdf using the Bearer API key.',
          operationId: 'downloadDeliveryNotePdf',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Binary PDF file',
              content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
            },
            '401': { description: 'Unauthorized' },
            '404': { description: 'Order not found' },
          },
        },
      },
      '/api/connector/grok/orders/delivery-notes/batch': {
        post: {
          summary: 'Batch Merged Delivery Notes PDF',
          description: 'Generate or merge delivery notes for multiple orders into a single combined batch PDF (Lieferscheine_Sammel_Batch). Accepts orderIds array or query param ?ids=id1,id2. If format=pdf or Accept: application/pdf is specified, streams the binary PDF file directly.',
          operationId: 'generateBatchDeliveryNotes',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderIds'],
                  properties: {
                    orderIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } },
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        get: {
          summary: 'Download Batch Merged Delivery Notes PDF',
          description: 'Download combined batch delivery notes PDF for given comma-separated order IDs (?ids=id1,id2&format=pdf).',
          operationId: 'downloadBatchDeliveryNotes',
          parameters: [
            { name: 'ids', in: 'query', required: true, schema: { type: 'string' }, description: 'Comma-separated order IDs' },
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['pdf', 'json'] } },
          ],
          responses: {
            '200': {
              content: {
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
                'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } },
              },
            },
          },
        },
      },
      '/api/connector/grok/orders/{id}/shipping-label': {
        post: {
          summary: 'Create Shipping Label & Auto-Confirm Marketplace',
          description: 'Creates a shipping label with Hermes, DHL, or DPD, assigns tracking number, and automatically confirms the shipment with the tracking number on the marketplace. Idempotent: If the order already has a tracking number or label URL, returns the existing label immediately without duplicate carrier charges and ensures marketplace confirmation is synced.',
          operationId: 'generateShippingLabel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    carrier: { type: 'string', enum: ['dhl', 'hermes', 'dpd'] },
                    parcelClass: { type: 'string', description: 'Hermes parcel class (XS, S, M, L, XL)' },
                    weightKg: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/{id}/confirm-shipment': {
        post: {
          summary: 'Confirm Shipment on Marketplace',
          description: 'Transmit tracking number and mark order as shipped on the connected marketplace (Otto, About You, Decathlon, Amazon, etc.).',
          operationId: 'confirmOrderShipment',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    carrier: { type: 'string', default: 'HERMES' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/shipping-labels/batch': {
        post: {
          summary: 'Batch Merged Shipping Labels PDF',
          description: 'Merge existing shipping labels (outbound and return) for multiple orders into a single printable batch PDF (Versandlabels_Sammel). If format=pdf or Accept: application/pdf is specified, streams the binary PDF directly.',
          operationId: 'generateBatchShippingLabels',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderIds'],
                  properties: {
                    orderIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } },
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        get: {
          summary: 'Download Batch Merged Shipping Labels PDF',
          description: 'Download combined batch shipping labels PDF for given comma-separated order IDs (?ids=id1,id2&format=pdf).',
          operationId: 'downloadBatchShippingLabels',
          parameters: [
            { name: 'ids', in: 'query', required: true, schema: { type: 'string' }, description: 'Comma-separated order IDs' },
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['pdf', 'json'] } },
          ],
          responses: {
            '200': {
              content: {
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
                'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } },
              },
            },
          },
        },
      },
      '/api/connector/grok/orders/{id}/cancel': {
        post: {
          summary: 'Cancel Order',
          description: 'Cancel order and write cancellation notes.',
          operationId: 'cancelOrder',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { reason: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/invoices': {
        get: {
          summary: 'List Invoices',
          description: 'List invoices with status, recipient, date, and document type filters.',
          operationId: 'listInvoices',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'documentType', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/invoices/{id}': {
        get: {
          summary: 'Get Invoice Details',
          description: 'Returns invoice lines, recipient snapshot, payment state, and download URLs.',
          operationId: 'getInvoiceDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/invoices/{id}/cancel': {
        post: {
          summary: 'Cancel Invoice (Storno)',
          description: 'GoBD-compliant invoice cancellation generating an immutable credit note row.',
          operationId: 'cancelInvoice',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/invoices/{id}/pay': {
        post: {
          summary: 'Mark Invoice As Paid',
          description: 'Record that an invoice has been paid.',
          operationId: 'markInvoicePaid',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/invoices/generate-missing': {
        post: {
          summary: 'Bulk Generate Missing Invoices',
          description: 'Batch generates invoices for all uninvoiced orders.',
          operationId: 'bulkGenerateMissingInvoices',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { maxCount: { type: 'integer', default: 20 } },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products': {
        get: {
          summary: 'List Products (Wawi)',
          description: 'Search catalog, filter by low stock, preorder, or keywords.',
          operationId: 'listProducts',
          parameters: [
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'lowStockOnly', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        post: {
          summary: 'Create Product',
          description: 'Add a new product to the central catalog.',
          operationId: 'createProduct',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sku', 'title', 'price'],
                  properties: {
                    sku: { type: 'string' },
                    title: { type: 'string' },
                    price: { type: 'number' },
                    currentStock: { type: 'number' },
                    ean: { type: 'string' },
                    brand: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/{id}': {
        get: {
          summary: 'Get Product Details',
          description: 'Get product information, pricing, stock, and channel mappings.',
          operationId: 'getProductDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        patch: {
          summary: 'Update Product',
          description: 'Update fields on a product.',
          operationId: 'updateProduct',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    price: { type: 'number' },
                    description: { type: 'string' },
                    brand: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/{id}/stock': {
        post: {
          summary: 'Adjust Stock',
          description: 'Set exact inventory or add/subtract an adjustment delta.',
          operationId: 'adjustStock',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    newStock: { type: 'number' },
                    adjustmentDelta: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/sync': {
        post: {
          summary: 'Trigger Inventory Sync',
          description: 'Pushes inventory and prices out to Otto, Amazon, Shopify, Mirakl, eBay.',
          operationId: 'syncInventory',
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped': {
        get: {
          summary: 'List Unmapped Marketplace Listings',
          description: 'List listings from Otto, Amazon, Shopify, Mirakl, or eBay that are not yet mapped to a central product.',
          operationId: 'listUnmappedListings',
          parameters: [
            { name: 'marketplace', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'isBlocked', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped/{id}': {
        get: {
          summary: 'Get Unmapped Listing Details',
          description: 'Get raw payload, extracted EAN, and auto-mapping suggestions for an unmapped listing.',
          operationId: 'getUnmappedListingDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped/{id}/map': {
        post: {
          summary: 'Map Unmapped Listing to Product',
          description: 'Connect an unmapped listing to an existing central OmniStack product by ID or SKU.',
          operationId: 'mapUnmappedListing',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['productId'],
                  properties: {
                    productId: { type: 'string', description: 'Central product UUID or SKU' },
                    syncStock: { type: 'boolean', default: true },
                    syncPrice: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped/{id}/create-and-map': {
        post: {
          summary: 'Create Product and Map',
          description: 'Create a central product directly from an unmapped listing and establish mapping.',
          operationId: 'createAndMapProduct',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string' },
                    title: { type: 'string' },
                    price: { type: 'number' },
                    currentStock: { type: 'number' },
                    ean: { type: 'string' },
                    brand: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped/auto-map': {
        post: {
          summary: 'Auto-Map Unmapped Listings',
          description: 'Automatically match and map all unmapped listings matching central products by SKU or EAN.',
          operationId: 'autoMapUnmappedListings',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dryRun: { type: 'boolean', default: false },
                    marketplace: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/mappings': {
        get: {
          summary: 'List Product Mappings',
          description: 'List active marketplace product mappings connecting central products to sales channels.',
          operationId: 'listProductMappings',
          parameters: [
            { name: 'productId', in: 'query', schema: { type: 'string' } },
            { name: 'marketplace', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        post: {
          summary: 'Set / Update Product Mapping',
          description: 'Create or update a manual mapping linking a central product to a marketplace listing.',
          operationId: 'setProductMapping',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['productId', 'marketplace', 'marketplaceSku'],
                  properties: {
                    productId: { type: 'string' },
                    marketplace: { type: 'string' },
                    marketplaceSku: { type: 'string' },
                    marketplaceProductId: { type: 'string' },
                    integrationId: { type: 'string' },
                    ean: { type: 'string' },
                    syncStock: { type: 'boolean', default: true },
                    syncPrice: { type: 'boolean', default: false },
                    priceModifierType: { type: 'string', enum: ['none', 'percentage', 'fixed'] },
                    priceModifierValue: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/mappings/{id}': {
        delete: {
          summary: 'Delete Product Mapping',
          description: 'Unlink a marketplace product mapping and optionally restore to unmapped listings.',
          operationId: 'deleteProductMapping',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'restoreToUnmapped', in: 'query', schema: { type: 'boolean', default: true } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/returns': {
        get: {
          summary: 'List Returns',
          description: 'List logged returns and physical inspection status.',
          operationId: 'listReturns',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'orderNumber', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        post: {
          summary: 'Register Incoming Return',
          description: 'Register a return package with returned items and condition.',
          operationId: 'registerReturn',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderNumber'],
                  properties: {
                    orderNumber: { type: 'string' },
                    customerName: { type: 'string' },
                    items: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/returns/{id}': {
        get: {
          summary: 'Get Return Details',
          description: 'Get full details of a return log and returned items.',
          operationId: 'getReturnDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/customers': {
        get: {
          summary: 'List Customers',
          description: 'Search customer directory.',
          operationId: 'listCustomers',
          parameters: [{ name: 'query', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
        post: {
          summary: 'Create Customer',
          description: 'Add a new customer.',
          operationId: 'createCustomer',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    companyName: { type: 'string' },
                    email: { type: 'string' },
                    street: { type: 'string' },
                    zip: { type: 'string' },
                    city: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/integrations': {
        get: {
          summary: 'List Integrations',
          description: 'List active marketplace and shipping integrations.',
          operationId: 'listIntegrations',
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/integrations/sync': {
        post: {
          summary: 'Trigger Marketplace Order Sync',
          description: 'Triggers background worker to download new orders from Otto, Amazon, Shopify, eBay, Decathlon.',
          operationId: 'triggerSync',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { marketplace: { type: 'string', default: 'all' } },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
    },
  }
}

export function jsonToYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null) return 'null'
  if (typeof obj === 'boolean' || typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj.includes('"') || obj.startsWith('@')) {
      return JSON.stringify(obj)
    }
    return obj
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const inner = jsonToYaml(item, indent + 1).trimStart()
          return `${pad}- ${inner}`
        }
        return `${pad}- ${jsonToYaml(item, 0)}`
      })
      .join('\n')
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    if (keys.length === 0) return '{}'
    return keys
      .map((key) => {
        const val = obj[key]
        if (typeof val === 'object' && val !== null && (!Array.isArray(val) || val.length > 0)) {
          return `${pad}${key}:\n${jsonToYaml(val, indent + 1)}`
        }
        return `${pad}${key}: ${jsonToYaml(val, indent + 1)}`
      })
      .join('\n')
  }
  return String(obj)
}

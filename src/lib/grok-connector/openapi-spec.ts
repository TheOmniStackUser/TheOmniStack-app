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
        post: {
          summary: 'Generate Delivery Note',
          description: 'Creates a delivery note number and retrieves download path for the order delivery slip.',
          operationId: 'generateDeliveryNote',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/orders/{id}/shipping-label': {
        post: {
          summary: 'Create Shipping Label',
          description: 'Creates a shipping label with DHL, Hermes, or DPD and assigns tracking number.',
          operationId: 'generateShippingLabel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    carrier: { type: 'string', enum: ['dhl', 'hermes', 'dpd'] },
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

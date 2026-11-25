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
        OrderSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            marketplace: { type: 'string', example: 'otto' },
            marketplaceOrderId: { type: 'string', example: 'OTTO-12345678' },
            status: {
              type: 'string',
              enum: ['draft', 'pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment'],
            },
            shippingStatus: {
              type: 'string',
              nullable: true,
              enum: ['in_preparation', 'in_transit', 'delivered', 'ready_for_pickup', 'delayed', 'not_possible', 'returned'],
            },
            isArchived: { type: 'boolean' },
            deliveryNoteNumber: { type: 'string', nullable: true },
            buyerName: { type: 'string', nullable: true },
            buyerEmail: { type: 'string', nullable: true },
            shippingName: { type: 'string', nullable: true },
            shippingCity: { type: 'string', nullable: true },
            shippingCountry: { type: 'string', nullable: true },
            currency: { type: 'string', example: 'EUR' },
            totalAmount: { type: 'string', nullable: true, example: '49.90' },
            trackingNumber: { type: 'string', nullable: true },
            labelUrl: { type: 'string', nullable: true },
            invoiceId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginationMeta: {
          type: 'object',
          required: ['total', 'limit', 'offset', 'hasMore'],
          properties: {
            total: { type: 'integer', example: 42 },
            limit: { type: 'integer', example: 25 },
            offset: { type: 'integer', example: 0 },
            hasMore: { type: 'boolean', example: true },
          },
        },
        ListOrdersResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              required: ['orders', 'pagination'],
              properties: {
                orders: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/OrderSummary' },
                },
                pagination: { $ref: '#/components/schemas/PaginationMeta' },
              },
            },
          },
        },
        ReturnRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            companyId: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid', nullable: true },
            orderNumber: { type: 'string' },
            customerName: { type: 'string', nullable: true },
            shippingAddress: { type: 'string', nullable: true },
            scannedAt: { type: 'string', format: 'date-time' },
            receivedAt: { type: 'string', format: 'date-time' },
            processedByUserId: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', example: 'neu' },
            marketplace: { type: 'string', nullable: true },
            metadata: { type: 'object', nullable: true },
            notes: { type: 'string', nullable: true },
          },
        },
        ReturnedItemRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            returnLogId: { type: 'string', format: 'uuid' },
            skuOrProductName: { type: 'string' },
            quantity: { type: 'integer' },
            condition: { type: 'string', enum: ['new', 'used_good', 'damaged', 'defect'] },
            notes: { type: 'string', nullable: true },
          },
        },
        ReturnAuditTrailEntry: {
          type: 'object',
          required: ['timestamp', 'source', 'changes'],
          properties: {
            timestamp: { type: 'string', format: 'date-time', description: 'ISO-8601 UTC timestamp of the correction' },
            source: { type: 'string', example: 'grok-connector', description: 'System or connector that made the change' },
            userId: { type: 'string', format: 'uuid', nullable: true, description: 'Acting user ID if authenticated with a personal key' },
            changes: {
              type: 'object',
              description: 'Field-level diff recorded for this update',
              properties: {
                orderNumber: {
                  type: 'object',
                  properties: {
                    old: { type: 'string', nullable: true },
                    new: { type: 'string' },
                  },
                },
                orderId: {
                  type: 'object',
                  properties: {
                    old: { type: 'string', format: 'uuid', nullable: true },
                    new: { type: 'string', format: 'uuid' },
                  },
                },
                notes: {
                  type: 'object',
                  properties: {
                    old: { type: 'string', nullable: true },
                    new: { type: 'string', nullable: true },
                  },
                },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      oldSku: { type: 'string' },
                      newSku: { type: 'string' },
                      oldQuantity: { type: 'integer' },
                      newQuantity: { type: 'integer' },
                      oldCondition: { type: 'string' },
                      newCondition: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        ReturnDetailsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              required: ['return', 'items', 'auditTrail'],
              properties: {
                return: { $ref: '#/components/schemas/ReturnRecord' },
                items: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ReturnedItemRecord' },
                },
                auditTrail: {
                  type: 'array',
                  description: 'Chronological audit trail of return corrections stored on return.metadata.auditLog',
                  items: { $ref: '#/components/schemas/ReturnAuditTrailEntry' },
                },
                message: { type: 'string', description: 'Optional informational message (e.g. when no changes were detected)' },
              },
            },
          },
        },
        UpdateReturnRequest: {
          type: 'object',
          description: 'Fields to update on a return while in status neu or in_klaerung. At least one field should be provided.',
          properties: {
            returnId: {
              type: 'string',
              format: 'uuid',
              description: 'Return log ID (UUID). Optional in the PATCH /returns/{id} body since {id} comes from the path parameter; if supplied, it must match {id}.',
            },
            orderNumber: {
              type: 'string',
              description: 'Corrected marketplace order number, tracking number, return tracking number, customer number, or delivery note number to re-link this return',
            },
            items: {
              type: 'array',
              description: 'Corrected return line items',
              items: {
                type: 'object',
                required: ['sku'],
                properties: {
                  id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Return line item ID (UUID). Required if the return has multiple items; optional if the return has only 1 line item.',
                  },
                  sku: {
                    type: 'string',
                    description: 'Corrected SKU (case-insensitive; also resolves EAN/SKU via central product catalog onto the linked order)',
                  },
                  quantity: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Corrected quantity (> 0, cannot exceed ordered quantity minus already-returned quantity on other returns)',
                  },
                  condition: {
                    type: 'string',
                    enum: ['new', 'used_good', 'damaged', 'defect'],
                    description: 'Updated item inspection condition',
                  },
                  notes: {
                    type: 'string',
                    description: 'Updated line item notes',
                  },
                },
              },
            },
            notes: {
              type: 'string',
              description: 'Return-level notes or correction comment',
            },
          },
        },
        RefundReturnRequest: {
          type: 'object',
          description: 'Optional refund payload. Both requestBody and items are optional.',
          properties: {
            items: {
              type: 'array',
              description: 'Optional list of items to refund and optionally restock. If omitted or empty, defaults to all items on the return with restock: true.',
              items: {
                type: 'object',
                required: ['sku', 'quantity'],
                properties: {
                  sku: { type: 'string', description: 'SKU (or EAN) of the item to refund' },
                  quantity: { type: 'integer', minimum: 1, description: 'Quantity to refund' },
                  restock: {
                    type: 'boolean',
                    description: 'Whether to restock into warehouse inventory (defaults to true when items is omitted; defaults to condition === new when items is provided without restock)',
                  },
                },
              },
            },
          },
        },
        RefundReturnResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              required: ['success', 'creditNoteNumber', 'refundedAmountEur', 'currency'],
              properties: {
                success: { type: 'boolean', example: true },
                creditNoteNumber: { type: 'string', example: 'GS-00123' },
                creditNoteId: { type: 'string', format: 'uuid', nullable: true },
                refundedAmountEur: { type: 'number', format: 'float', example: 49.9, description: 'Total refunded gross amount in EUR' },
                currency: { type: 'string', example: 'EUR' },
                refundedAmount: { type: 'number', format: 'float', example: 49.9, description: 'Total refunded gross amount in order currency' },
                orderCurrency: { type: 'string', example: 'EUR' },
                subtotalAmountEur: { type: 'number', format: 'float', example: 41.93 },
                taxAmountEur: { type: 'number', format: 'float', example: 7.97 },
                refundedItems: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sku: { type: 'string' },
                      quantity: { type: 'integer' },
                      restock: { type: 'boolean' },
                      amountEur: { type: 'number', format: 'float' },
                    },
                  },
                },
              },
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
          description: 'List and filter merchant orders with pagination, status, marketplace, customerName, orderNumber, sku, date range, and archived filters.',
          operationId: 'listOrders',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['draft', 'pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment'] },
              description: 'Filter by order status',
            },
            { name: 'marketplace', in: 'query', schema: { type: 'string' }, description: 'Filter by marketplace channel (e.g. otto, amazon, shopify, ebay, kaufland)' },
            { name: 'query', in: 'query', schema: { type: 'string' }, description: 'Free-text search across order ID, customer name, email, tracking number, and customer number' },
            { name: 'customerName', in: 'query', schema: { type: 'string' }, description: 'Filter by buyer or shipping customer name (case-insensitive substring match)' },
            { name: 'orderNumber', in: 'query', schema: { type: 'string' }, description: 'Filter by marketplace order number or raw order number fields (orderNumber, order_number, salesOrderId, name)' },
            { name: 'sku', in: 'query', schema: { type: 'string' }, description: 'Filter orders containing a specific product SKU in order items (case-insensitive substring match)' },
            { name: 'fromDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'ISO-8601 start date (inclusive)' },
            { name: 'toDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'ISO-8601 end date (inclusive)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
            { name: 'archived', in: 'query', schema: { type: 'boolean' }, description: 'Filter by archived status (e.g. false for open orders)' },
            { name: 'isArchived', in: 'query', schema: { type: 'boolean' }, description: 'Alias for archived (e.g. false for open orders)' },
          ],
          responses: {
            '200': {
              description: 'Paginated list of matching orders',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ListOrdersResponse' } } },
            },
            '400': {
              description: 'Invalid query parameters',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardErrorResponse' } } },
            },
            '401': { description: 'Unauthorized' },
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
          description: 'Creates a shipping label with Hermes, DHL, or DPD, assigns tracking number, and automatically confirms the shipment with the tracking number on the marketplace. Idempotent by default: If the order already has a tracking number or label URL, returns the existing label immediately without duplicate carrier charges. Set replaceExisting: true to void/replace an existing label and re-issue a new label with given/resolved parcelClass and weight, re-issuing return labels for About You and pushing new tracking to marketplaces. Set dryRun: true to preview resolution without creating carrier charges.',
          operationId: 'generateShippingLabel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    carrier: { type: 'string', enum: ['dhl', 'hermes', 'dpd'] },
                    parcelClass: { type: 'string', description: 'Hermes parcel class (XS, S, M, L, XL). Defaults to XS, or S if footwear is detected in order items.' },
                    weightKg: { type: 'number' },
                    replaceExisting: { type: 'boolean', description: 'Void and re-issue label if one already exists, updating marketplace tracking (default: false)' },
                    dryRun: { type: 'boolean', description: 'Validate addresses and resolve carrier, parcel class, and weight without creating carrier charges' },
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
      '/api/connector/grok/orders/{id}/shipping-label/void': {
        post: {
          summary: 'Void Shipping Label',
          description: 'Voids an existing carrier shipping label, clears tracking number and label PDF URLs, and resets shipping status to in_preparation. For Hermes, unscanned labels expire automatically without carrier charges.',
          operationId: 'voidShippingLabel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
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
          description: 'Generate or merge shipping labels (outbound and return) for multiple orders into a single printable batch PDF (Versandlabels_Sammel). Automatically generates missing labels with the resolved or provided parcel class. If format=pdf or Accept: application/pdf is specified, streams the binary PDF directly.',
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
                    carrier: { type: 'string', enum: ['hermes', 'dhl', 'dpd'] },
                    parcelClass: { type: 'string', description: 'Hermes parcel class (XS, S, M, L, XL)' },
                    weightKg: { type: 'number' },
                    replaceExisting: { type: 'boolean' },
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
          description: 'Update fields on a product including title, price, reducedPrice, msrp (UVP), purchasePrice, brand, etc.',
          operationId: 'updateProduct',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', description: 'Product ID (UUID) or SKU' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    price: { type: 'number', description: 'Regular price gross EUR' },
                    reducedPrice: { type: 'number', nullable: true, description: 'Reduced promotional price gross EUR (null to remove)' },
                    msrp: { type: 'number', nullable: true, description: 'Manufacturer Suggested Retail Price (UVP) gross EUR (must be > 0; null to remove)' },
                    purchasePrice: { type: 'number' },
                    description: { type: 'string' },
                    brand: { type: 'string' },
                    weight: { type: 'number' },
                    storageLocation: { type: 'string' },
                    ean: { type: 'string' },
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
      '/api/connector/grok/products/bulk-prices': {
        post: {
          summary: 'Bulk Update Product Prices',
          description: 'Update regular prices, reduced promotional prices, and/or UVP (msrp) in bulk (up to 500 items). Supports dry-run simulation.',
          operationId: 'bulkUpdatePrices',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sku: { type: 'string' },
                          productId: { type: 'string' },
                          price: { type: 'number' },
                          reducedPrice: { type: 'number', nullable: true },
                          msrp: { type: 'number', nullable: true, description: 'Manufacturer Suggested Retail Price (UVP) gross EUR (must be > 0; null to remove)' },
                        },
                      },
                    },
                    dryRun: { type: 'boolean' },
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
      '/api/connector/grok/products/price-rules': {
        get: {
          summary: 'Get Channel Price Rules',
          description: 'Read channel price rules (Shopify, OTTO, About You, Amazon, Kaufland, etc.). Optional sku or productId returns calculated prices per channel.',
          operationId: 'getPriceRules',
          parameters: [
            { name: 'productId', in: 'query', schema: { type: 'string' } },
            { name: 'sku', in: 'query', schema: { type: 'string' } },
            { name: 'marketplace', in: 'query', schema: { type: 'string' } },
            { name: 'integrationId', in: 'query', schema: { type: 'string' } },
          ],
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
      '/api/connector/grok/products/sync-prices': {
        post: {
          summary: 'Trigger Price Sync',
          description: 'Pushes price updates to connected marketplaces with rules and modifiers applied. Returns a tracked jobId.',
          operationId: 'triggerPriceSync',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    skus: { type: 'array', items: { type: 'string' } },
                    sku: { type: 'string' },
                    productIds: { type: 'array', items: { type: 'string' } },
                    productId: { type: 'string' },
                    dryRun: { type: 'boolean' },
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
      '/api/connector/grok/products/sync-status/{jobId}': {
        get: {
          summary: 'Get Sync Status',
          description: 'Check status, error messages, and channel success counts for an asynchronous sync job.',
          operationId: 'getSyncStatus',
          parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
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
      '/api/connector/grok/products/unmapped/{id}/block': {
        post: {
          summary: 'Block Unmapped Listing',
          description: 'Set an unmapped listing to blocked so it is excluded from default unmapped listings and auto-mapping.',
          operationId: 'blockUnmappedListing',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reason: { type: 'string', description: 'Optional reason or note for blocking this listing' },
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
      '/api/connector/grok/products/unmapped/{id}/unblock': {
        post: {
          summary: 'Unblock Unmapped Listing',
          description: 'Reverse the blocked status of an unmapped listing so it reappears in unmapped listings and auto-mapping.',
          operationId: 'unblockUnmappedListing',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
          },
        },
      },
      '/api/connector/grok/products/unmapped/block-batch': {
        post: {
          summary: 'Batch Block Unmapped Listings',
          description: 'Block multiple unmapped listings at once with per-ID status reporting.',
          operationId: 'blockUnmappedListingsBatch',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['unmappedIds'],
                  properties: {
                    unmappedIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'List of unmapped listing IDs to block',
                    },
                    reason: { type: 'string', description: 'Optional reason or note for blocking these listings' },
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
          description: 'Get full details of a return log, returned items, and the chronological auditTrail of corrections.',
          operationId: 'getReturnDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Return details including return record, items, and auditTrail',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ReturnDetailsResponse' } } },
            },
            '400': {
              description: 'Return not found or invalid UUID returnId',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardErrorResponse' } } },
            },
            '401': { description: 'Unauthorized' },
          },
        },
        patch: {
          summary: 'Update / Correct Return',
          description:
            'Correct a return before refunding: change orderNumber (re-links matching order after verifying same customer and same marketplace), update items (id, sku, quantity, condition, notes), and set notes. Allowed only when status is neu or in_klaerung and not yet refunded; records all changes in auditTrail.',
          operationId: 'updateReturn',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateReturnRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Return updated (or no changes detected), returning updated return, items, and auditTrail',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ReturnDetailsResponse' } } },
            },
            '400': {
              description:
                'Validation error. Possible error reasons: invalid JSON body or body returnId mismatch with path {id}; invalid UUID format; return not found; return status is not neu/in_klaerung or return has already been refunded; target orderNumber not found for merchant; customer mismatch between return and target order; marketplace mismatch between return and target order; return has no linked order with line items when correcting items; missing or invalid line item id (required when return has multiple items); empty SKU or SKU not present on the linked order; quantity <= 0 or quantity exceeds ordered quantity minus already-returned quantity on other non-cancelled returns.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' },
                  examples: {
                    invalidJsonOrMismatch: {
                      summary: 'Invalid JSON or mismatched returnId',
                      value: { success: false, error: "Body returnId '...' does not match path parameter id '...'." },
                    },
                    statusNotEditable: {
                      summary: 'Return already refunded or status not editable',
                      value: { success: false, error: "Return '...' cannot be modified because it is in status 'bearbeitet' or has already been refunded." },
                    },
                    orderNotFound: {
                      summary: 'Order not found',
                      value: { success: false, error: "Order '...' not found for this merchant." },
                    },
                    customerMismatch: {
                      summary: 'Customer mismatch on re-link',
                      value: { success: false, error: "Customer mismatch: Return belongs to customer '...', but order '...' belongs to '...'." },
                    },
                    marketplaceMismatch: {
                      summary: 'Marketplace mismatch on re-link',
                      value: { success: false, error: "Marketplace mismatch: Return belongs to marketplace 'otto', but order '...' belongs to 'shopify'." },
                    },
                    lineItemIdRequired: {
                      summary: 'Missing item id on multi-item return',
                      value: { success: false, error: 'Line item id is required when return has multiple items.' },
                    },
                    skuNotOnOrder: {
                      summary: 'SKU does not exist on linked order',
                      value: { success: false, error: "SKU '...' does not exist on the linked order. Available order SKUs: SKU-1, SKU-2." },
                    },
                    quantityExceeded: {
                      summary: 'Quantity exceeds returnable quantity',
                      value: { success: false, error: "Quantity 2 exceeds available order quantity (1) for SKU 'SKU-1' (ordered: 1, already returned: 0)." },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/connector/grok/returns/{id}/status': {
        post: {
          summary: 'Update Return Status',
          description: 'Update the processing status of a return (e.g. neu, in_klaerung, geprueft, abgeschlossen).',
          operationId: 'updateReturnStatus',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', description: 'New return status (e.g. neu, geprueft, abgeschlossen)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
            '400': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardErrorResponse' } } } },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/connector/grok/returns/{id}/refund': {
        post: {
          summary: 'Refund Return',
          description:
            'Execute automated refund for a return through the connected marketplace integration and return credit note details plus the refunded amount in EUR (refundedAmountEur). Request body and items are optional: when items is omitted or empty, defaults to all items on the return with restock: true. Double-refunding and refunding cancelled returns are blocked.',
          operationId: 'refundReturn',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefundReturnRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Refund executed with credit note info and refunded amount in EUR',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RefundReturnResponse' } } },
            },
            '400': {
              description: 'Validation, double-refund protection, or marketplace refund error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardErrorResponse' } } },
            },
            '401': { description: 'Unauthorized' },
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
    if (
      obj === '' ||
      obj.includes('\n') ||
      obj.includes(':') ||
      obj.includes('#') ||
      obj.includes('"') ||
      obj.startsWith('@') ||
      /^[\[{*&!%?\->|'\s]/.test(obj) ||
      /\s$/.test(obj) ||
      /^(true|false|null|yes|no|on|off)$/i.test(obj)
    ) {
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

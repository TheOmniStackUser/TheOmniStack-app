const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

// Load environment variables from .env.local
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  }
}

const cache = new Map();

function requireTS(filePath) {
  const absolutePath = path.resolve(filePath);
  if (cache.has(absolutePath)) {
    return cache.get(absolutePath);
  }

  let tsCode = fs.readFileSync(absolutePath, 'utf8');
  
  const replaceAlias = (match, p1) => {
    const depth = path.relative(path.dirname(absolutePath), path.resolve(__dirname, '../src')).replace(/\\/g, '/');
    const relativePrefix = depth ? (depth.startsWith('.') ? depth : './' + depth) : '.';
    return match.replace(`@/${p1}`, `${relativePrefix}/${p1}`);
  };

  tsCode = tsCode.replace(/from\s+['"]@\/(.*)['"]/g, replaceAlias);
  tsCode = tsCode.replace(/import\s+.*\s+from\s+['"]@\/(.*)['"]/g, replaceAlias);
  tsCode = tsCode.replace(/import\(['"]@\/(.*)['"]\)/g, replaceAlias);

  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true
    }
  }).outputText;

  const m = new module.constructor();
  m.filename = absolutePath;
  m.paths = module.paths;
  
  const exportsObj = {};
  cache.set(absolutePath, exportsObj);

  const originalRequire = m.require;
  m.require = function(request) {
    if (request.endsWith('client') && (request.includes('/db/') || request.startsWith('@/db/'))) {
      return { db: {} };
    }

    if (request.startsWith('.') || request.startsWith('/') || request.startsWith('..')) {
      const resolvedPath = path.resolve(path.dirname(absolutePath), request);
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        if (fs.existsSync(resolvedPath + ext)) {
          return requireTS(resolvedPath + ext);
        }
        if (fs.existsSync(path.join(resolvedPath, 'index' + ext))) {
          return requireTS(path.join(resolvedPath, 'index' + ext));
        }
      }
    }
    return originalRequire.apply(this, arguments);
  };

  m._compile(jsCode, absolutePath);
  
  Object.assign(exportsObj, m.exports);
  cache.set(absolutePath, exportsObj);
  return exportsObj;
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    const [order] = await sql`SELECT * FROM orders WHERE id = '6dcac5b8-6d44-4fc4-beba-6f0ec54d3e58'`;
    const items = await sql`SELECT * FROM order_items WHERE order_id = '6dcac5b8-6d44-4fc4-beba-6f0ec54d3e58'`;
    const [company] = await sql`SELECT * FROM companies WHERE id = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'`;
    
    order.items = items;
    
    console.log('Order ID:', order.id);
    console.log('Company ID:', company.id);

    // Mock txContext
    const mockTx = {
      query: {
        orders: {
          findFirst: async ({ where, with: withRelations }) => {
            console.log('[MockTx] query.orders.findFirst called');
            return order;
          }
        }
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              console.log('[MockTx] select company called');
              return [company];
            },
            for: async () => {
              console.log('[MockTx] select company for update called');
              return [company];
            }
          })
        })
      }),
      update: (table) => ({
        set: (data) => ({
          where: async () => {
            console.log('[MockTx] update table called with:', data);
            return {};
          }
        })
      }),
      insert: (table) => ({
        values: (data) => ({
          returning: async () => {
            console.log('[MockTx] insert table returning called');
            return [{ id: 'mock-invoice-id' }];
          },
          then: (resolve) => {
            console.log('[MockTx] insert table values called (no return)');
            resolve({});
          }
        })
      })
    };

    // Load invoice-service
    const { createInvoiceForOrder } = requireTS('src/lib/invoice-service.ts');
    
    console.log('Running createInvoiceForOrder with MockTx...');
    const result = await createInvoiceForOrder(order.id, company.id, { txContext: mockTx });
    console.log('Success result:', result);
  } catch (err) {
    console.error('FAILED WITH ERROR:', err);
    if (err.stack) console.error(err.stack);
  } finally {
    await sql.end();
  }
}

main();

const postgres = require('postgres');

async function getAccessToken(config) {
  if (!config.clientSecret || config.clientId === config.clientSecret) {
    console.log(`[Mirakl] Using legacy API Key mode.`);
    return null;
  }
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('audience', 'mirakl-connect');

    const response = await fetch('https://auth.mirakl.net/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Mirakl] OAuth2 failed (${response.status}): ${errText}`);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.warn(`[Mirakl] OAuth2 request failed. Falling back to API Key.`, error);
    return null;
  }
}

async function acceptOrder(config, orderId, orderLines) {
  try {
    const token = await getAccessToken(config);
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      const apiKey = config.clientSecret === '' || !config.clientSecret 
        ? config.clientId 
        : config.apiKey;
      
      if (apiKey) {
        headers['Authorization'] = apiKey;
        headers['X-Mirakl-Api-Key'] = apiKey;
      }
    }

    let acceptUrl = '';
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    
    if (baseUrl.includes('miraklconnect.com')) {
      if (baseUrl.endsWith('/v1')) {
        acceptUrl = `${baseUrl}/orders/${orderId}/accept`;
      } else {
        acceptUrl = `${baseUrl}/api/v1/orders/${orderId}/accept`;
      }
    } else {
      if (baseUrl.endsWith('/api')) {
        acceptUrl = `${baseUrl}/orders/${orderId}/accept`;
      } else {
        acceptUrl = `${baseUrl}/api/orders/${orderId}/accept`;
      }
    }

    if (config.shopId) {
      acceptUrl += `?shop_id=${config.shopId}`;
    }

    console.log(`[Mirakl] Accepting order ${orderId} via PUT ${acceptUrl}...`);

    const response = await fetch(acceptUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ order_lines: orderLines })
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`[Mirakl] Accept Order failed (${response.status}): ${bodyText}`);
      return false;
    }

    console.log(`[Mirakl] Order ${orderId} successfully accepted: ${bodyText}`);
    return true;
  } catch (error) {
    console.error(`[Mirakl] Error accepting order ${orderId}:`, error);
    return false;
  }
}

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  console.log('Fetching integrations from database...');
  const integrations = await sql`
    SELECT * FROM marketplace_integrations 
    WHERE is_active = true 
      AND (type::text LIKE 'mirakl_%' OR type::text = 'mirakl_custom')
  `;
  
  console.log(`Found ${integrations.length} active Mirakl integrations.`);
  
  for (const integration of integrations) {
    console.log(`\n---------------------------------------------`);
    console.log(`Integration Type: ${integration.type}`);
    console.log(`Base URL: ${integration.environment}`);
    console.log(`Client ID (redacted): ${integration.client_id ? integration.client_id.substring(0, 8) + '...' : 'none'}`);
    
    const config = {
      baseUrl: integration.environment,
      clientId: integration.client_id,
      clientSecret: integration.client_secret,
      apiKey: integration.api_key,
      shopId: integration.metadata ? integration.metadata.shopId : null
    };
    
    const token = await getAccessToken(config);
    const headers = {
      'Accept': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      const apiKey = config.clientSecret === '' || !config.clientSecret 
        ? config.clientId 
        : config.apiKey;
      
      if (apiKey) {
        headers['Authorization'] = apiKey;
        headers['X-Mirakl-Api-Key'] = apiKey;
      }
    }
    
    let url = '';
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    
    if (baseUrl.includes('miraklconnect.com')) {
      if (baseUrl.endsWith('/v1')) {
        url = `${baseUrl}/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`;
      } else {
        url = `${baseUrl}/api/v1/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`;
      }
    } else {
      if (baseUrl.endsWith('/api')) {
        url = `${baseUrl}/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`;
      } else {
        url = `${baseUrl}/api/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`;
      }
    }
    
    if (config.shopId) {
      url += `&shop_id=${config.shopId}`;
    }
    
    console.log(`Fetching orders via GET ${url}...`);
    try {
      const response = await fetch(url, { method: 'GET', headers });
      const bodyText = await response.text();
      console.log(`Response Status: ${response.status}`);
      console.log(`Response Start: ${bodyText.substring(0, 300)}`);
      
      if (response.ok) {
        const data = JSON.parse(bodyText);
        const orders = data.orders || [];
        console.log(`Total orders fetched: ${orders.length}`);
        
        for (const order of orders) {
          console.log(`- Order ID: ${order.order_id}, State: ${order.order_state}`);
          
          if (order.order_state === 'WAITING_ACCEPTANCE') {
            const lines = (order.order_lines || []).map(line => ({
              id: line.order_line_id,
              accepted: true
            }));
            console.log(`  Accepting order lines: ${JSON.stringify(lines)}`);
            if (lines.length > 0) {
              await acceptOrder(config, order.order_id, lines);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error processing integration:`, err);
    }
  }
  
  await sql.end();
}

run().then(() => {
  console.log('\nDiagnostic run finished.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

const postgres = require('postgres');

async function getAccessToken(config) {
  if (!config.clientSecret || config.clientId === config.clientSecret) {
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
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    return null;
  }
}

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  console.log('Fetching integrations...');
  const integrations = await sql`
    SELECT * FROM marketplace_integrations 
    WHERE is_active = true 
      AND (type::text LIKE 'mirakl_%' OR type::text = 'mirakl_custom')
  `;
  
  for (const integration of integrations) {
    console.log(`\n---------------------------------------------`);
    console.log(`Integration Type: ${integration.type}`);
    console.log(`Base URL: ${integration.environment}`);
    
    const config = {
      baseUrl: integration.environment,
      clientId: integration.client_id,
      clientSecret: integration.client_secret,
      apiKey: integration.api_key
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
    
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    let url = '';
    if (baseUrl.includes('miraklconnect.com')) {
      url = `${baseUrl}/api/v1/orders?max=10`;
    } else {
      url = `${baseUrl}/api/orders?max=10`;
    }
    
    console.log(`Fetching last 10 orders from ${url}...`);
    try {
      const response = await fetch(url, { method: 'GET', headers });
      const bodyText = await response.text();
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = JSON.parse(bodyText);
        const orders = data.orders || [];
        console.log(`Total orders found: ${orders.length} (total_count: ${data.total_count})`);
        for (const order of orders) {
          console.log(` - Order ID: ${order.order_id}, Commercial ID: ${order.commercial_id}, State: ${order.order_state}, Created: ${order.created_date}`);
        }
      } else {
        console.error(`Error response: ${bodyText}`);
      }
    } catch (err) {
      console.error(`Fetch failed:`, err);
    }
  }
  
  await sql.end();
}

run();

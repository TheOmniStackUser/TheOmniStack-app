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

async function updateTracking(config, orderId, trackingNumber, carrier, rawPayload) {
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

  const baseUrl = config.baseUrl.replace(/\/$/, '');
  let trackingUrl = '';
  if (baseUrl.includes('miraklconnect.com')) {
    if (baseUrl.endsWith('/v1')) {
      trackingUrl = `${baseUrl}/orders/${orderId}/tracking`;
    } else {
      trackingUrl = `${baseUrl}/api/v1/orders/${orderId}/tracking`;
    }
  } else {
    if (baseUrl.endsWith('/api')) {
      trackingUrl = `${baseUrl}/orders/${orderId}/tracking`;
    } else {
      trackingUrl = `${baseUrl}/api/orders/${orderId}/tracking`;
    }
  }

  if (config.shopId) {
    trackingUrl += `?shop_id=${config.shopId}`;
  }

  let country = 'DE';
  if (rawPayload && typeof rawPayload === 'object') {
    country = rawPayload.customer?.shipping_address?.country_iso_code 
      || rawPayload.customer?.shipping_address?.country 
      || 'DE';
  }

  const upperCountry = country.toUpperCase();
  const isDe = ['DE', 'DEU'].includes(upperCountry);
  const isNl = ['NL', 'NLD'].includes(upperCountry);
  const isEs = ['ES', 'ESP'].includes(upperCountry);
  const isBe = ['BE', 'BEL'].includes(upperCountry);
  const isCh = ['CH', 'CHE'].includes(upperCountry);
  const isFr = ['FR', 'FRA'].includes(upperCountry);
  const isPl = ['PL', 'POL'].includes(upperCountry);
  const isIt = ['IT', 'ITA'].includes(upperCountry);
  const isCz = ['CZ', 'CZE'].includes(upperCountry);
  const isHu = ['HU', 'HUN'].includes(upperCountry);
  const isRo = ['RO', 'ROU'].includes(upperCountry);
  const isGb = ['GB', 'GBR'].includes(upperCountry);

  let resolvedCarrier = carrier;
  if (carrier.toLowerCase() === 'dhl') {
    if (isDe) resolvedCarrier = 'DHLDE';
    else if (isNl) resolvedCarrier = 'DHL (NL)';
    else if (isEs) resolvedCarrier = 'DHLESP';
    else if (isBe) resolvedCarrier = 'DHLBE';
    else if (isCh) resolvedCarrier = 'DHL-CH';
    else if (isFr) resolvedCarrier = 'DHLFR';
    else if (isPl) resolvedCarrier = 'DHL PL';
    else if (isIt) resolvedCarrier = 'DHL ITA';
    else if (isCz) resolvedCarrier = 'DHL-CZ';
    else if (isHu) resolvedCarrier = 'DHLHU';
    else if (isRo) resolvedCarrier = 'DHL RO';
    else if (isGb) resolvedCarrier = 'dhlUK';
    else resolvedCarrier = 'DHLDE';
  } else if (carrier.toLowerCase() === 'hermes') {
    if (isGb) resolvedCarrier = 'HermesUK';
    else resolvedCarrier = 'HermesGER';
  }

  const trackingPayload = {
    carrier_code: resolvedCarrier,
    carrier_name: resolvedCarrier,
    tracking_number: trackingNumber
  };

  const response = await fetch(trackingUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(trackingPayload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Update Tracking failed (${response.status}): ${text}`);
  }
  return true;
}

async function shipOrder(config, orderId) {
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

  const baseUrl = config.baseUrl.replace(/\/$/, '');
  let shipUrl = '';
  if (baseUrl.includes('miraklconnect.com')) {
    if (baseUrl.endsWith('/v1')) {
      shipUrl = `${baseUrl}/orders/${orderId}/ship`;
    } else {
      shipUrl = `${baseUrl}/api/v1/orders/${orderId}/ship`;
    }
  } else {
    if (baseUrl.endsWith('/api')) {
      shipUrl = `${baseUrl}/orders/${orderId}/ship`;
    } else {
      shipUrl = `${baseUrl}/api/orders/${orderId}/ship`;
    }
  }

  if (config.shopId) {
    shipUrl += `?shop_id=${config.shopId}`;
  }

  const response = await fetch(shipUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({})
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Validate Shipment failed (${response.status}): ${text}`);
  }
  return true;
}

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  // 1. Fetch integrations
  const integrations = await sql`
    SELECT id, type, is_active, metadata, client_id, client_secret, api_key, environment
    FROM marketplace_integrations
    WHERE is_active = true AND (type = 'mirakl_decathlon' OR type = 'mirakl_custom')
  `;
  
  console.log(`Loaded ${integrations.length} active Mirakl integrations.`);
  
  // 2. Fetch the shipped Decathlon orders since 2026-05-25
  const orders = await sql`
    SELECT id, marketplace, marketplace_order_id, status, tracking_number, shipping_country, raw_payload
    FROM orders
    WHERE (marketplace LIKE 'decathlon%' OR marketplace = 'mirakl_custom')
      AND status = 'shipped'
      AND updated_at >= '2026-05-25 00:00:00'
    ORDER BY updated_at DESC
  `;
  
  console.log(`Found ${orders.length} shipped Decathlon orders to confirm.`);

  for (const o of orders) {
    console.log(`\n=============================================`);
    console.log(`Processing Order: ${o.marketplace_order_id} (${o.marketplace}, Country: ${o.shipping_country})`);
    
    // Determine candidates
    const candidates = [];
    
    // Candidate 1: Direct match based on marketplace customName
    let customNameMatch = null;
    if (o.marketplace.toLowerCase().startsWith('decathlon')) {
      customNameMatch = integrations.find(i => {
        const name = (i.metadata?.customName || '').toLowerCase();
        return name === o.marketplace.toLowerCase();
      });
    }
    
    if (customNameMatch) {
      candidates.push({ name: customNameMatch.metadata.customName, integration: customNameMatch });
    }
    
    // Candidate 2: Try specific country integration based on shipping country/channel code
    const channelCountry = o.raw_payload?.channel?.code || o.shipping_country;
    if (channelCountry) {
      const countryInt = integrations.find(i => {
        const name = (i.metadata?.customName || '').toLowerCase();
        return name.includes(`decathlon ${channelCountry.toLowerCase()}`) || name === `decathlon ${channelCountry.toLowerCase()}`;
      });
      if (countryInt && countryInt.id !== customNameMatch?.id) {
        candidates.push({ name: countryInt.metadata.customName, integration: countryInt });
      }
    }
    
    // Candidate 3: Main mirakl_decathlon integration (EU/DE)
    const mainDecathlon = integrations.find(i => i.type === 'mirakl_decathlon');
    if (mainDecathlon && mainDecathlon.id !== customNameMatch?.id) {
      candidates.push({ name: 'mirakl_decathlon', integration: mainDecathlon });
    }
    
    // Candidate 4: Fallback to all other Decathlon integrations
    for (const i of integrations) {
      if (candidates.some(c => c.integration.id === i.id)) continue;
      const isDecathlon = i.type === 'mirakl_decathlon' || (i.metadata?.customName || '').toLowerCase().includes('decathlon');
      if (isDecathlon) {
        candidates.push({ name: i.metadata?.customName || i.type, integration: i });
      }
    }
    
    console.log(`Candidates for confirmation (in order):`, candidates.map(c => c.name));
    
    let confirmed = false;
    for (const candidate of candidates) {
      console.log(`-> Attempting confirmation with: ${candidate.name}...`);
      try {
        const config = {
          baseUrl: candidate.integration.environment,
          clientId: candidate.integration.client_id,
          clientSecret: candidate.integration.client_secret,
          apiKey: candidate.integration.api_key,
          shopId: candidate.integration.metadata ? candidate.integration.metadata.shopId : null
        };
        
        await updateTracking(
          config,
          o.marketplace_order_id,
          o.tracking_number,
          'DHL',
          o.raw_payload
        );
        
        await shipOrder(config, o.marketplace_order_id);
        
        console.log(`✔ SUCCESS: Confirmed order ${o.marketplace_order_id} using ${candidate.name}!`);
        confirmed = true;
        break;
      } catch (err) {
        console.log(`❌ FAILED with ${candidate.name}:`, err.message || err);
      }
    }
    
    if (!confirmed) {
      console.log(`⚠ WARNING: Could not confirm order ${o.marketplace_order_id} with any candidate integration.`);
    }
  }
  
  await sql.end();
}

run().catch(console.error);

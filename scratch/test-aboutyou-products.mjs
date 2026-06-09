async function testProducts() {
  const baseUrl = 'https://partner.aboutyou.com/api/v1'
  const apiKey = 'ouqB2vUs.M3NWyA9RSo5ScftwdB62s6a6PEFn1lEgZlyJZ8VpCSnNDngpPvu3Ix5w'
  
  const endpoints = ['/products', '/articles', '/offers', '/inventory', '/assortments']
  
  for (const ep of endpoints) {
    const url = `${baseUrl}${ep}`
    console.log(`Testing ${url}...`)
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' } })
      if (!res.ok) {
        console.log(`  Failed: ${res.status} - ${await res.text()}`)
      } else {
        const data = await res.json()
        console.log(`  Success! Keys: ${Object.keys(data)}`)
        if (data.items) console.log(`  Items count: ${data.items.length}`)
      }
    } catch (e) {
      console.log(`  Error: ${e}`)
    }
  }
}
testProducts()

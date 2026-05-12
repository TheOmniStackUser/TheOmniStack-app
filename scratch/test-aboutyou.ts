
import { AboutYouAdapter } from './src/adapters/marketplace/aboutyou'

async function testAboutYou() {
  const adapter = new AboutYouAdapter({
    apiKey: 'ouqB2vUs.M3NWyA9RSo5ScftwdB62s6a6PEFn1lEgZlyJZ8VpCSnNDngpPvu3Ix5w',
    environment: 'production'
  })

  try {
    console.log('Testing About You API...')
    // Test with status=open
    const ordersOpen = await adapter.fetchUnshippedOrders('test-company')
    console.log(`Found ${ordersOpen.length} orders with status=open`)
    
    // Test with other common statuses if 0 found
    if (ordersOpen.length === 0) {
      console.log('Trying alternative status: status=new...')
      // Manually calling fetch to test different statuses
      const baseUrl = 'https://partner.aboutyou.com/api/v1'
      const statuses = ['new', 'pending', 'processing']
      
      for (const status of statuses) {
        const url = `${baseUrl}/orders?order_status=${status}&per_page=10`
        const res = await fetch(url, {
          headers: { 'X-API-Key': 'ouqB2vUs.M3NWyA9RSo5ScftwdB62s6a6PEFn1lEgZlyJZ8VpCSnNDngpPvu3Ix5w' }
        })
        const data = await res.json()
        console.log(`Status "${status}": Found ${(data.items || []).length} orders`)
      }
    }
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testAboutYou()

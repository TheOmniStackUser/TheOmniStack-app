const text = `item-name	item-description	listing-id	seller-sku	price	quantity	open-date	image-url	item-is-marketplace	product-id-type	zshop-shipping-fee	item-note	item-condition	zshop-category1	zshop-browse-path	zshop-storefront-feature	asin1	asin2	asin3	will-ship-internationally	expedited-shipping	zshop-boldface	product-id	bid-for-featured-placement	add-delete	pending-quantity	fulfillment-channel
GUGGEN Mountain Badehose	desc	list1	AZ-Baadehose-GM-WHB2347-Gestreift-L	34.00	974	date	img	y	4	0	note	11	cat	path	feat	B00X1D2WAO			y	y	n	1234567890123	0	a	0	DEFAULT`

const lines = text.split(/\r?\n/).filter(l => l.trim())
const headers = lines[0].split('\t').map(h => h.toLowerCase().trim())
const skuIdx = headers.findIndex(h => h.includes('sku') && !h.includes('fnsku'))
const asinIdx = headers.findIndex(h => h === 'asin1' || h === 'asin')
const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('title'))
const priceIdx = headers.findIndex(h => h.includes('price'))
const quantityIdx = headers.findIndex(h => h.includes('quantity'))
const productIdIdx = headers.findIndex(h => h === 'product-id')
const productIdTypeIdx = headers.findIndex(h => h === 'product-id-type')

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t')
  const sku = cols[skuIdx]?.trim()

  let ean: string | undefined = undefined
  if (productIdIdx !== -1 && cols[productIdIdx]) {
    const pid = cols[productIdIdx].trim()
    const pType = productIdTypeIdx !== -1 ? cols[productIdTypeIdx]?.trim() : null
    if (pType === '4' || pType === '3' || pid.length === 13) {
      ean = pid
    }
  }

  const rowData: Record<string, string> = {}
  for (let j = 0; j < headers.length; j++) {
    if (cols[j]) rowData[headers[j]] = cols[j].trim()
  }

  console.log({
    sku, ean, rowData
  })
}

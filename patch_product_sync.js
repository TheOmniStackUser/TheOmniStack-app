const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/workers/product-sync.ts')
let content = fs.readFileSync(file, 'utf8')

// Replace sequential loop with Promise.all
const originalLoop = `  const integrationEntries = Object.entries(updatesByIntegration)
  let currentIndex = 0

  for (const [integrationId, mpUpdates] of integrationEntries) {`

const newLoop = `  const integrationEntries = Object.entries(updatesByIntegration)
  let currentIndex = 0

  await Promise.all(integrationEntries.map(async ([integrationId, mpUpdates]) => {`

content = content.replace(originalLoop, newLoop)

// Replace the end of the loop
const originalEnd = `    currentIndex++
  }`

const newEnd = `    currentIndex++
  }))`

// Find the last occurrence of currentIndex++
const lastIndex = content.lastIndexOf('currentIndex++')
if (lastIndex !== -1) {
  content = content.slice(0, lastIndex) + newEnd + content.slice(content.indexOf('}', lastIndex) + 1)
}

fs.writeFileSync(file, content)

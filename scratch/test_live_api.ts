import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const apiKey = 'os_live_leis_leis_gb_7747099a'
  const url = 'https://app.theomnistack.de/api/v1/returns/analyze-image'
  
  const imagePath = './scratch/media__1778959937598.png'
  const fullPath = path.resolve(imagePath)
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`)
    return
  }

  console.log(`Sending image ${imagePath} to live API: ${url}...`)
  
  const imageBuffer = fs.readFileSync(fullPath)
  const blob = new Blob([imageBuffer], { type: 'image/png' })
  const formData = new FormData()
  formData.append('image', blob, 'scan.jpg')

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      },
      body: formData
    })

    console.log(`Response Status: ${response.status} ${response.statusText}`)
    const text = await response.text()
    console.log("Response Body:")
    console.log(text)
  } catch (error) {
    console.error("Fetch Error:", error)
  }
}

main()

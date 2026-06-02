import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY
console.log('Using API key:', apiKey ? `${apiKey.slice(0, 5)}...` : 'undefined')

const genAI = new GoogleGenerativeAI(apiKey || '')

async function callGemini(i: number) {
  console.log(`Starting call ${i}...`)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent('Say hello')
  console.log(`Call ${i} response:`, result.response.text().trim())
}

async function main() {
  for (let i = 1; i <= 5; i++) {
    try {
      await callGemini(i)
    } catch (err: any) {
      console.error(`Call ${i} failed:`, err.message)
    }
  }
}

main()

import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
const genAI = new GoogleGenerativeAI(apiKey)

async function main() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Full data:", JSON.stringify(data, null, 2));
    const names = data.models ? data.models.map((m: any) => m.name) : [];
    console.log("First 10 models:\n", names.slice(0, 10).join('\n'));
  } catch (error) {
    console.error("Error listing models:", error)
  }
}

main()

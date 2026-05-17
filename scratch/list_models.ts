import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = 'AIzaSyCsajjv733r3mJuDB_8GB0c9zCNYQFGUWM'
const genAI = new GoogleGenerativeAI(apiKey)

async function main() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    const names = data.models.map((m: any) => m.name);
    console.log("First 10 models:\n", names.slice(0, 10).join('\n'));
  } catch (error) {
    console.error("Error listing models:", error)
  }
}

main()

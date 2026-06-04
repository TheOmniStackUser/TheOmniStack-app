const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function run() {
  for (let i = 0; i < 5; i++) {
    console.log(`Request ${i+1}...`);
    try {
      await model.generateContent("Say 'test' number " + i);
      console.log(`Success ${i+1}`);
    } catch (e) {
      console.error(`Error ${i+1}:`, e.message);
    }
  }
}
run();

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function run() {
  // Create a dummy image buffer (approx 3MB)
  const buffer = Buffer.alloc(3 * 1024 * 1024, 'a');
  const base64Data = buffer.toString('base64');
  
  const inlineContent = [
    "Test prompt",
    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
  ];

  for (let i = 0; i < 3; i++) {
    console.log(`Request ${i+1}...`);
    try {
      await model.generateContent(inlineContent);
      console.log(`Success ${i+1}`);
    } catch (e) {
      console.error(`Error ${i+1}:`, e.message);
    }
  }
}
run();

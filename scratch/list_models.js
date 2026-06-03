const apiKey = process.env.GEMINI_API_KEY || require('dotenv').config({ path: '.env.local' }).parsed.GEMINI_API_KEY;
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  .then(res => res.json())
  .then(data => console.log(data.models.map(m => m.name).join('\n')))
  .catch(console.error);

#!/bin/bash
API_KEY=$(grep GEMINI_API_KEY .env.local | cut -d '=' -f 2)
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "contents": [{
    "parts": [{"text": "Hello, explain how to say hi in German."}]
  }]
}'

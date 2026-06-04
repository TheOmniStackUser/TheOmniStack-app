#!/bin/bash
API_KEY=$(grep GEMINI_API_KEY .env.local | cut -d '=' -f 2)
for i in {1..5}; do
  echo "Request $i..."
  curl -s -o /dev/null -w "%{http_code}\n" "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{
      "parts": [{"text": "Say test"}]
    }]
  }'
done

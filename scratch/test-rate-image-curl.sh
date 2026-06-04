#!/bin/bash
API_KEY=$(grep GEMINI_API_KEY .env.local | cut -d '=' -f 2)

dd if=/dev/urandom bs=1M count=1 2>/dev/null | base64 > scratch/dummy.b64
DATA=$(cat scratch/dummy.b64 | tr -d '\n')

cat << JSON > scratch/payload.json
{
  "contents": [{
    "parts": [
      {"text": "Analyze"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "$DATA"}}
    ]
  }]
}
JSON

for i in {1..3}; do
  echo "Request $i..."
  curl -s -o /dev/null -w "%{http_code}\n" "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -d @scratch/payload.json
done

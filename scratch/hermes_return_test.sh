#!/bin/bash

# INT Credentials
APP_ID="hsi.int.verm.theomnistack"
APP_SECRET="ZRLD4LtrD8vDihgieheT"
USERNAME="testkunde3"
PASSWORD="ewrfn:gN"

AUTH_URL="https://authme-int.myhermes.de/authorization-facade/oauth2/access_token"
BASE_URL="https://de-api-int.hermesworld.com"
USER_AGENT="TheOmniStack/1.0"

# 1. Get Token
AUTH_RESPONSE=$(curl -s -X POST "$AUTH_URL" \
  -d "grant_type=password" \
  -d "client_id=$APP_ID" \
  -d "client_secret=$APP_SECRET" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token')

# 2. Try with expanded returnService block
PAYLOAD=$(cat <<EOF
{
  "clientReference": "INT-RET-$(date +%s | tail -c 6)",
  "receiverName": {
    "firstname": "Max",
    "lastname": "Mustermann"
  },
  "receiverAddress": {
    "street": "Essener Str.",
    "houseNumber": "2",
    "zipCode": "22419",
    "town": "Hamburg",
    "countryCode": "DE"
  },
  "senderName": {
    "firstname": "TheOmniStack",
    "lastname": "Test Account"
  },
  "senderAddress": {
    "street": "Musterstraße",
    "houseNumber": "1",
    "zipCode": "50667",
    "town": "Köln",
    "countryCode": "DE"
  },
  "parcel": {
    "parcelWeight": 1500,
    "parcelClass": "S",
    "parcelVolume": 50,
    "productType": "PARCEL"
  },
  "service": {
    "returnService": {
      "returnReceiverName": {
        "name1": "TheOmniStack Returns"
      },
      "returnReceiverAddress": {
        "street": "Musterstraße",
        "houseNumber": "1",
        "zipCode": "50667",
        "town": "Köln",
        "countryCode": "DE"
      },
      "returnProductType": "PARCEL",
      "returnServiceType": "RETURN"
    }
  }
}
EOF
)

RESPONSE=$(curl -s -X POST "$BASE_URL/services/hsi/shipmentorders/labels" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/shippinglabel-pdf+json" \
  -d "$PAYLOAD")

echo "$RESPONSE" > scratch/return_response.json
echo "Response saved to scratch/return_response.json"

# Check if return label is there
RETURN_B64=$(echo "$RESPONSE" | jq -r '.returnLabelImage // .shipmentOrder.returnLabelImage // .returnShipments[0].labelImage // ""')

if [ ! -z "$RETURN_B64" ]; then
    echo "$RETURN_B64" | base64 -D > scratch/hermes_return_label.pdf
    echo "SUCCESS: Return Label saved to scratch/hermes_return_label.pdf"
else
    echo "WARNING: No return label found. Result codes:"
    echo "$RESPONSE" | jq '.listOfResultCodes'
fi

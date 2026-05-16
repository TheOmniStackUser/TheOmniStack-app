#!/bin/bash

# INT Credentials
APP_ID="hsi.int.verm.theomnistack"
APP_SECRET="ZRLD4LtrD8vDihgieheT"
USERNAME="testkunde3"
PASSWORD="ewrfn:gN"

AUTH_URL="https://authme-int.myhermes.de/authorization-facade/oauth2/access_token"
BASE_URL="https://de-api-int.hermesworld.com/services/hsi/shipmentorders/labels"

# 1. Get Token
AUTH_RESPONSE=$(curl -s -X POST "$AUTH_URL" \
  -d "grant_type=password" \
  -d "client_id=$APP_ID" \
  -d "client_secret=$APP_SECRET" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
    echo "Auth failed"
    echo "$AUTH_RESPONSE"
    exit 1
fi

echo "Auth Success"

# Function to test a payload
test_payload() {
    NAME=$1
    PAYLOAD=$2
    echo "Testing $NAME..."
    RESPONSE=$(curl -s -X POST "$BASE_URL" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$PAYLOAD")
    
    WARNINGS=$(echo "$RESPONSE" | jq -r '.listOfResultCodes[] | select(.code != "OK") | .message' | head -n 1)
    if [ -z "$WARNINGS" ]; then
        echo "  SUCCESS: No warnings!"
        echo "$RESPONSE" > "scratch/success_$NAME.json"
    else
        echo "  WARNING: $WARNINGS"
    fi
}

# Payload 1: service.returnService (current)
test_payload "singular_service" '{"clientReference":"TEST-1","receiverName":{"firstname":"Max","lastname":"Mustermann"},"receiverAddress":{"street":"Essener Str.","houseNumber":"2","zipCode":"22419","town":"Hamburg","countryCode":"DE"},"senderName":{"firstname":"TheOmniStack","lastname":"Test"},"senderAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DE"},"parcel":{"parcelWeight":1000,"parcelClass":"S","productType":"PARCEL"},"service":{"returnService":{"returnReceiverName":{"name1":"Return Center"},"returnReceiverAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DEU"},"returnProductType":"PARCEL","returnServiceType":"RETURN"}}}'

# Payload 2: services.returnService (plural)
test_payload "plural_services" '{"clientReference":"TEST-2","receiverName":{"firstname":"Max","lastname":"Mustermann"},"receiverAddress":{"street":"Essener Str.","houseNumber":"2","zipCode":"22419","town":"Hamburg","countryCode":"DE"},"senderName":{"firstname":"TheOmniStack","lastname":"Test"},"senderAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DE"},"parcel":{"parcelWeight":1000,"parcelClass":"S","productType":"PARCEL"},"services":{"returnService":{"returnReceiverName":{"name1":"Return Center"},"returnReceiverAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DEU"},"returnProductType":"PARCEL","returnServiceType":"RETURN"}}}'

# Payload 3: root returnService
test_payload "root_return" '{"clientReference":"TEST-3","receiverName":{"firstname":"Max","lastname":"Mustermann"},"receiverAddress":{"street":"Essener Str.","houseNumber":"2","zipCode":"22419","town":"Hamburg","countryCode":"DE"},"senderName":{"firstname":"TheOmniStack","lastname":"Test"},"senderAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DE"},"parcel":{"parcelWeight":1000,"parcelClass":"S","productType":"PARCEL"},"returnService":{"returnReceiverName":{"name1":"Return Center"},"returnReceiverAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DEU"},"returnProductType":"PARCEL","returnServiceType":"RETURN"}}'

# Payload 4: service.flexReturnService
test_payload "flex_return" '{"clientReference":"TEST-4","receiverName":{"firstname":"Max","lastname":"Mustermann"},"receiverAddress":{"street":"Essener Str.","houseNumber":"2","zipCode":"22419","town":"Hamburg","countryCode":"DE"},"senderName":{"firstname":"TheOmniStack","lastname":"Test"},"senderAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DE"},"parcel":{"parcelWeight":1000,"parcelClass":"S","productType":"PARCEL"},"service":{"flexReturnService":"true","returnService":{"returnReceiverName":{"name1":"Return Center"},"returnReceiverAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DEU"},"returnProductType":"PARCEL","returnServiceType":"RETURN"}}}'

# Payload 5: returnShipment
test_payload "return_shipment" '{"clientReference":"TEST-5","receiverName":{"firstname":"Max","lastname":"Mustermann"},"receiverAddress":{"street":"Essener Str.","houseNumber":"2","zipCode":"22419","town":"Hamburg","countryCode":"DE"},"senderName":{"firstname":"TheOmniStack","lastname":"Test"},"senderAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DE"},"parcel":{"parcelWeight":1000,"parcelClass":"S","productType":"PARCEL"},"service":{"returnShipment":{"returnReceiverName":{"name1":"Return Center"},"returnReceiverAddress":{"street":"Musterstraße","houseNumber":"1","zipCode":"50667","town":"Köln","countryCode":"DEU"}}}}'

import os
import urllib.request
import json
import ssl
from psycopg2 import connect

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

db_url = os.environ.get('DATABASE_URL')
if not db_url:
    if os.path.exists('.env.local'):
        with open('.env.local') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.strip().split('=', 1)[1].strip('"\'')
                    break

conn = connect(db_url)
cursor = conn.cursor()
cursor.execute("SELECT environment, client_id, client_secret, api_key, metadata FROM marketplace_integrations WHERE type = 'mirakl_custom' AND metadata->>'customName' ILIKE 'secret sales de%' AND is_active = true")
row = cursor.fetchone()
if not row:
    print("Integration not found")
    exit(1)

env, client_id, client_secret, api_key, metadata = row

print(f"Env: {env}")
token = None
try:
    data = urllib.parse.urlencode({'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': client_secret, 'audience': 'mirakl-connect'}).encode()
    req = urllib.request.Request('https://auth.mirakl.net/oauth/token', data=data)
    with urllib.request.urlopen(req, context=ctx) as res:
        token = json.loads(res.read().decode())['access_token']
except Exception as e:
    print("OAuth failed", e)

headers = {'Accept': 'application/json'}
if token:
    headers['Authorization'] = f'Bearer {token}'
else:
    key = client_id if not client_secret else api_key
    headers['Authorization'] = key
    headers['X-Mirakl-Api-Key'] = key

url = f"{env}/api/v1/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100"
if 'shopId' in metadata:
    url += f"&shop_id={metadata['shopId']}"
print("Fetching:", url)

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as res:
        data = json.loads(res.read().decode())
        orders = data.get('orders', [])
        print(f"Found {len(orders)} orders.")
        for o in orders:
            print(f"- {o['order_id']} | state: {o['order_state']} | channel: {o.get('channel',{}).get('code')} | country: {o['customer']['shipping_address']['country_iso_code']}")
except Exception as e:
    print("Failed to fetch orders:", e)


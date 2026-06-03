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

env, client_id, client_secret, api_key, metadata = row
headers = {'Accept': 'application/json'}
key = client_id if not client_secret else api_key
headers['Authorization'] = key
headers['X-Mirakl-Api-Key'] = key

url = f"{env}/api/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100"
if 'shopId' in metadata:
    url += f"&shop_id={metadata['shopId']}"

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req, context=ctx) as res:
    data = json.loads(res.read().decode())
    orders = data.get('orders', [])
    for o in orders:
        print(json.dumps(o, indent=2))

import pg8000.dbapi
import ssl
import json

DATABASE_URL = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

url = DATABASE_URL.replace("postgresql://", "")
creds, rest = url.split("@")
username, password = creds.split(":")
host_db = rest.split("?")[0]
host, database = host_db.split("/")

ssl_context = ssl.create_default_context()

try:
    conn = pg8000.dbapi.connect(
        user=username,
        password=password,
        host=host,
        database=database,
        ssl_context=ssl_context
    )
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT id, marketplace, marketplace_order_id, shipping_country, buyer_name, raw_payload FROM orders WHERE marketplace ILIKE '%secret sales%'"
    )
    rows = cursor.fetchall()
    
    print(f"Found {len(rows)} Secret Sales orders:")
    for row in rows:
        order_id, marketplace, marketplace_order_id, shipping_country, buyer_name, raw_payload_str = row
        channel_code = None
        if raw_payload_str:
            try:
                # raw_payload is stored as JSON or string
                if isinstance(raw_payload_str, str):
                    payload = json.loads(raw_payload_str)
                else:
                    payload = raw_payload_str
                channel_code = payload.get('channel', {}).get('code')
            except Exception as e:
                channel_code = f"Error: {e}"
        print(f"ID: {order_id} | Marketplace: {marketplace} | Order ID: {marketplace_order_id} | Country: {shipping_country} | Buyer: {buyer_name} | Channel: {channel_code}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

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
        "SELECT marketplace_order_id, raw_payload FROM orders WHERE marketplace_order_id = '6000212008-d-A'"
    )
    row = cursor.fetchone()
    if row:
        order_id, raw_payload = row
        print(f"Order: {order_id}")
        print(json.dumps(raw_payload, indent=2))
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

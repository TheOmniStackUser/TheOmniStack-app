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
    
    # Query latest shipped orders
    cursor.execute(
        "SELECT id, marketplace, status, tracking_number, updated_at, created_at FROM orders "
        "WHERE status = 'shipped' "
        "ORDER BY updated_at DESC LIMIT 10"
    )
    rows = cursor.fetchall()
    print("=== LATEST SHIPPED ORDERS ===")
    for row in rows:
        print(f"ID: {row[0]}")
        print(f"Marketplace: {row[1]}")
        print(f"Status: {row[2]}")
        print(f"Tracking Number: {row[3]}")
        print(f"Updated At: {row[4]}")
        print(f"Created At: {row[5]}")
        print("-" * 50)
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

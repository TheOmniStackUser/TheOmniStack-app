import pg8000.dbapi
import ssl

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
    
    # 1. Update orders table
    cursor.execute(
        "UPDATE orders SET marketplace = 'secret sales de' WHERE marketplace = 'secret sales se' AND shipping_country IN ('DE', 'DEU')"
    )
    orders_updated = cursor.rowcount
    
    # 2. Update returns_log table if there is a marketplace column
    returns_updated = 0
    try:
        cursor.execute(
            "UPDATE returns_log SET marketplace = 'secret sales de' WHERE marketplace = 'secret sales se' AND order_id IN (SELECT id FROM orders WHERE marketplace = 'secret sales de')"
        )
        returns_updated = cursor.rowcount
    except Exception as re:
        print("Note: returns_log update skipped or not applicable:", re)
        
    conn.commit()
    print(f"Successfully updated {orders_updated} orders and {returns_updated} returns_log entries.")
    
    cursor.close()
    conn.close()
except Exception as e:
    print("Database correction failed:", e)

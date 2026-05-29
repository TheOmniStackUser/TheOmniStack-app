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
    
    # Tables to search: orders, returns_log, invoices, etc.
    tables = ['orders', 'returns_log', 'invoices', 'invoice_items', 'order_items']
    
    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM information_schema.columns WHERE table_name = '{table}'")
            cols = [row[3] for row in cursor.fetchall()]
            for col in cols:
                # search if column contains 'secret sales se'
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE {col}::text = 'secret sales se'")
                    cnt = cursor.fetchone()[0]
                    if cnt > 0:
                        print(f"Table: {table} | Column: {col} | Matches: {cnt}")
                except Exception:
                    pass
        except Exception as e:
            print(f"Error reading table {table}: {e}")
            
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

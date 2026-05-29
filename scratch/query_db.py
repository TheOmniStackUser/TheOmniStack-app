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
    
    # Try inserting duplicate order to see the exact Postgres error message
    try:
        cursor.execute(
            "INSERT INTO orders (company_id, marketplace, marketplace_order_id) VALUES (%s, %s, %s)",
            ('549c1c0b-0d32-42b7-912f-0c1198d6d67e', 'manual', 'B-10001')
        )
        conn.commit()
        print("Insert succeeded (unexpected!)")
    except Exception as insert_err:
        print("=== INSERT ERROR ===")
        print("Type:", type(insert_err))
        print("Error:", insert_err)

    cursor.close()
    conn.close()
except Exception as e:
    print("Connection failed:", e)

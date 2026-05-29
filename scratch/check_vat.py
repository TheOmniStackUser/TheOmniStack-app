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
    
    # Get active company info
    cursor.execute(
        "SELECT id, country_code, vat_rate, vat_type FROM vat_settings WHERE company_id = %s",
        ('abe0132f-18e4-41a8-92f7-e65005cfa6aa',)
    )
    settings = cursor.fetchall()
    print("=== VAT SETTINGS ===")
    for s in settings:
        print(f"ID: {s[0]}, Country Code: {s[1]}, VAT Rate: {s[2]}, VAT Type: {s[3]}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

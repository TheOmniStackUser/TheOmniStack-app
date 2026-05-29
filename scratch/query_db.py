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
        "SELECT id, name, document_number_settings, next_invoice_number, next_delivery_note_number FROM companies WHERE id = %s",
        ('549c1c0b-0d32-42b7-912f-0c1198d6d67e',)
    )
    company = cursor.fetchone()
    print("=== COMPANY SETTINGS ===")
    if company:
        print("ID:", company[0])
        print("Name:", company[1])
        print("Doc Number Settings:", json.dumps(company[2], indent=2) if company[2] else None)
        print("Next Invoice Number:", company[3])
        print("Next Delivery Note Number:", company[4])
    else:
        print("Company not found!")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

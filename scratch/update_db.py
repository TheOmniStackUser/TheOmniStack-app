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
    
    # 1. Fetch current settings
    cursor.execute(
        "SELECT document_number_settings FROM companies WHERE id = %s",
        ('549c1c0b-0d32-42b7-912f-0c1198d6d67e',)
    )
    row = cursor.fetchone()
    if not row:
        print("Company not found!")
        exit(1)
        
    settings = row[0] or {}
    print("Old settings:", json.dumps(settings, indent=2))
    
    # 2. Update formats to include unique prefixes to prevent unique constraint collisions
    if "quote" in settings:
        settings["quote"]["format"] = "ANG-%nummer%"
    else:
        settings["quote"] = {
            "auto": True,
            "next": "10001",
            "format": "ANG-%nummer%",
            "padding": 5,
            "perContact": False
        }
        
    if "creditNote" in settings:
        settings["creditNote"]["format"] = "GS-%nummer%"
    else:
        settings["creditNote"] = {
            "auto": True,
            "next": "10001",
            "format": "GS-%nummer%",
            "padding": 5,
            "perContact": False
        }
        
    if "deliveryNote" in settings:
        settings["deliveryNote"]["format"] = "LS-%nummer%"
    else:
        settings["deliveryNote"] = {
            "auto": True,
            "next": "1",
            "format": "LS-%nummer%",
            "padding": 5,
            "perContact": False
        }
        
    print("\nNew settings to save:", json.dumps(settings, indent=2))
    
    # 3. Save back to database
    cursor.execute(
        "UPDATE companies SET document_number_settings = %s WHERE id = %s",
        (json.dumps(settings), '549c1c0b-0d32-42b7-912f-0c1198d6d67e')
    )
    conn.commit()
    print("\nSuccessfully updated database!")
    
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

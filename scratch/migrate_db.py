import os
import pg8000

# Connection string
db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# Parse connection string
# postgresql://user:password@host/dbname
url_clean = db_url.replace("postgresql://", "")
user_pass, host_db = url_clean.split("@")
user, password = user_pass.split(":")
host_port, dbname_query = host_db.split("/")
host = host_port.split(":")[0]
dbname = dbname_query.split("?")[0]

print(f"Connecting to host: {host}, db: {dbname}, user: {user}...")

conn = pg8000.connect(
    user=user,
    password=password,
    host=host,
    database=dbname,
    ssl_context=True
)

cursor = conn.cursor()

try:
    print("Executing ALTER TABLE statements...")
    cursor.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_footer text;")
    cursor.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_footer_en text;")
    cursor.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS offer_footer text;")
    cursor.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS offer_footer_en text;")
    conn.commit()
    print("Database migration successful!")
except Exception as e:
    conn.rollback()
    print("Error migrating database:", e)
finally:
    cursor.close()
    conn.close()

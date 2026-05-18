import psycopg2
import sys

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # 1. Fetch Companies
    cur.execute("SELECT id, name, api_key FROM companies;")
    companies = cur.fetchall()
    print("=== COMPANIES IN DATABASE ===")
    for c in companies:
        print(f"ID: {c[0]} | Name: {c[1]} | API Key: {c[2]}")
    print()
    
    # 2. Fetch Returns Logs
    cur.execute("SELECT id, company_id, order_number, customer_name, scanned_at FROM returns_log ORDER BY scanned_at DESC LIMIT 10;")
    logs = cur.fetchall()
    print("=== LATEST 10 RETURNS LOGS ===")
    for l in logs:
        print(f"LogID: {l[0]} | CompanyID: {l[1]} | Order: {l[2]} | Customer: {l[3]} | Scanned At: {l[4]}")
        
    cur.close()
    conn.close()
except Exception as e:
    print("Database Error:", e)
    sys.exit(1)

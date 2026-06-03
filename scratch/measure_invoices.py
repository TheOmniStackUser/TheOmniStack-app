import psycopg2
import time
import json

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    cur.execute("SELECT * FROM invoices WHERE company_id = %s", (company_id,))
    invoices = []
    columns = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        invoices.append(dict(zip(columns, row)))
        
    def default_serializer(obj):
        return str(obj)
        
    json_str = json.dumps(invoices, default=default_serializer)
    print(f"Total Invoices size: {len(json_str) / 1024 / 1024:.2f} MB")
    
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

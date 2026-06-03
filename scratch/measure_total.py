import psycopg2
import time
import json

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    cur.execute("SELECT sum(octet_length(t::text)) / 1024 / 1024 as sz FROM order_items t WHERE company_id = %s", (company_id,))
    print(f"Total order_items size: {cur.fetchone()[0]} MB")
    
    cur.execute("SELECT sum(octet_length(t::text)) / 1024 / 1024 as sz FROM orders t WHERE company_id = %s", (company_id,))
    print(f"Total orders size: {cur.fetchone()[0]} MB")
    
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

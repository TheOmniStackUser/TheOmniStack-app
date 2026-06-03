import psycopg2
import time
import json

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    cur.execute("""
        SELECT 
          id,
          octet_length(raw_payload::text) as raw_len,
          octet_length(shipping_name) as n_len,
          octet_length(shipping_street) as s_len
        FROM orders 
        WHERE company_id = %s 
        AND is_archived = false 
        AND status != 'draft'
        ORDER BY octet_length(raw_payload::text) DESC
        LIMIT 5
    """, (company_id,))
    
    print("Top 5 orders by raw_payload size:")
    for row in cur.fetchall():
        print(row)
        
    cur.execute("SELECT sum(octet_length(raw_payload::text)) / 1024 / 1024 as total_mb FROM orders WHERE company_id = %s AND is_archived = false AND status != 'draft'", (company_id,))
    print(f"Total raw_payload MB: {cur.fetchone()[0]}")
    
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

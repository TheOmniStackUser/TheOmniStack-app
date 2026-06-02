import psycopg2
import time

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # Get the company with the most orders
    cur.execute("""
        SELECT company_id
        FROM orders 
        WHERE is_archived = false AND status != 'draft' 
        GROUP BY company_id 
        ORDER BY count(*) DESC 
        LIMIT 1
    """)
    res = cur.fetchone()
    if not res:
        print("No orders found")
        return
        
    company_id = res[0]

    # Measure exact jsonb_build_object query
    t1 = time.time()
    query = """
        EXPLAIN ANALYZE SELECT 
          id, 
          CASE 
            WHEN raw_payload IS NULL THEN NULL
            ELSE jsonb_build_object(
              'orderNumber', raw_payload->>'orderNumber',
              'financial_status', raw_payload->>'financial_status',
              'manualBillingAddress', raw_payload->'manualBillingAddress',
              'invoiceAddress', raw_payload->'invoiceAddress',
              'customer', CASE WHEN raw_payload->'customer' IS NOT NULL THEN jsonb_build_object('billing_address', raw_payload->'customer'->'billing_address') ELSE NULL END,
              'billing_street', raw_payload->>'billing_street',
              'billing_zip_code', raw_payload->>'billing_zip_code',
              'billing_city', raw_payload->>'billing_city',
              'billing_country_code', raw_payload->>'billing_country_code'
            )
          END as raw_payload
        FROM orders 
        WHERE company_id = %s 
        AND is_archived = false 
        AND status != 'draft'
        ORDER BY marketplace_purchase_date DESC
    """
    cur.execute(query, (company_id,))
    for row in cur.fetchall():
        print(row[0])
        
    t2 = time.time()
    print(f"Base query + fetch took: {t2 - t1:.4f}s")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()

import psycopg2
import time

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    t1 = time.time()
    cur.execute("""
        SELECT 
          id, invoice_id, 
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
    """, (company_id,))
    res1 = cur.fetchall()
    t2 = time.time()
    print(f"Orders ({len(res1)} rows) took: {t2 - t1:.4f}s")
    
    cur.execute("SELECT * FROM order_items WHERE company_id = %s", (company_id,))
    res2 = cur.fetchall()
    t3 = time.time()
    print(f"Order Items ({len(res2)} rows) took: {t3 - t2:.4f}s")
    
    cur.execute("SELECT * FROM invoices WHERE company_id = %s", (company_id,))
    res3 = cur.fetchall()
    t4 = time.time()
    print(f"Invoices ({len(res3)} rows) took: {t4 - t3:.4f}s")
    
    cur.execute("SELECT * FROM invoice_logs WHERE company_id = %s", (company_id,))
    res4 = cur.fetchall()
    t5 = time.time()
    print(f"Invoice Logs ({len(res4)} rows) took: {t5 - t4:.4f}s")
    
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

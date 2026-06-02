import psycopg2
import time
import os

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # 1. Get an active company_id
    cur.execute("SELECT id FROM companies LIMIT 1")
    company_id = cur.fetchone()[0]
    print(f"Testing for company: {company_id}")

    # 2. Get base orders
    t1 = time.time()
    cur.execute("""
        EXPLAIN ANALYZE 
        SELECT * FROM orders 
        WHERE company_id = %s 
        AND is_archived = false 
        AND status != 'draft' 
        ORDER BY marketplace_purchase_date DESC
    """, (company_id,))
    print("\n--- Base Orders ---")
    for row in cur.fetchall():
        print(row[0])
    
    cur.execute("""
        SELECT id, invoice_id FROM orders 
        WHERE company_id = %s 
        AND is_archived = false 
        AND status != 'draft'
    """, (company_id,))
    orders = cur.fetchall()
    order_ids = [o[0] for o in orders]
    invoice_ids = [o[1] for o in orders if o[1]]
    t2 = time.time()
    print(f"Base query + fetch took: {t2 - t1:.4f}s")
    
    # 3. Get items
    print(f"\n--- Order Items (count={len(order_ids)}) ---")
    if order_ids:
        t1 = time.time()
        query = f"EXPLAIN ANALYZE SELECT * FROM order_items WHERE order_id IN %s"
        cur.execute(query, (tuple(order_ids),))
        for row in cur.fetchall():
            print(row[0])
        t2 = time.time()
        print(f"Items query took: {t2 - t1:.4f}s")

    # 4. Get invoices
    print(f"\n--- Invoices (count={len(invoice_ids)}) ---")
    if invoice_ids:
        t1 = time.time()
        query = f"EXPLAIN ANALYZE SELECT * FROM invoices WHERE id IN %s"
        cur.execute(query, (tuple(invoice_ids),))
        for row in cur.fetchall():
            print(row[0])
        t2 = time.time()
        print(f"Invoices query took: {t2 - t1:.4f}s")

    # 5. Get invoice logs
    print(f"\n--- Invoice Logs ---")
    if invoice_ids:
        t1 = time.time()
        query = f"EXPLAIN ANALYZE SELECT * FROM invoice_logs WHERE invoice_id IN %s"
        cur.execute(query, (tuple(invoice_ids),))
        for row in cur.fetchall():
            print(row[0])
        t2 = time.time()
        print(f"Invoice Logs query took: {t2 - t1:.4f}s")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()

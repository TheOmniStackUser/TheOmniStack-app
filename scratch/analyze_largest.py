import psycopg2
import time

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # Get the company with the most orders
    cur.execute("""
        SELECT company_id, count(*) 
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
    count = res[1]
    print(f"Company {company_id} has {count} active orders.")

    # Measure base orders
    t1 = time.time()
    cur.execute("""
        SELECT id, invoice_id FROM orders 
        WHERE company_id = %s 
        AND is_archived = false 
        AND status != 'draft'
        ORDER BY marketplace_purchase_date DESC
    """, (company_id,))
    orders = cur.fetchall()
    order_ids = [o[0] for o in orders]
    invoice_ids = [o[1] for o in orders if o[1]]
    t2 = time.time()
    print(f"Base query + fetch took: {t2 - t1:.4f}s")
    
    # Measure items
    if order_ids:
        t1 = time.time()
        # chunk by 1000 since Postgres IN clause can be slow if thousands
        # wait, order_ids is at most 600
        cur.execute(f"SELECT id FROM order_items WHERE order_id IN %s", (tuple(order_ids),))
        cur.fetchall()
        t2 = time.time()
        print(f"Items query took: {t2 - t1:.4f}s")

    # Measure invoices
    if invoice_ids:
        t1 = time.time()
        cur.execute(f"SELECT id FROM invoices WHERE id IN %s", (tuple(invoice_ids),))
        cur.fetchall()
        t2 = time.time()
        print(f"Invoices query took: {t2 - t1:.4f}s")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()

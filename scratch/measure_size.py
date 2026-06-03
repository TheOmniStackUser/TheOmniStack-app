import psycopg2
import time
import json

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    t1 = time.time()
    
    # 1. Base Orders
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
    base_orders = []
    columns = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        base_orders.append(dict(zip(columns, row)))
        
    # 2. Items
    cur.execute("SELECT * FROM order_items WHERE company_id = %s", (company_id,))
    items = []
    columns = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        items.append(dict(zip(columns, row)))
        
    # 3. Invoices
    cur.execute("SELECT * FROM invoices WHERE company_id = %s", (company_id,))
    invoices = []
    columns = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        invoices.append(dict(zip(columns, row)))
        
    # 4. Logs
    cur.execute("SELECT * FROM invoice_logs WHERE company_id = %s", (company_id,))
    logs = []
    columns = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        logs.append(dict(zip(columns, row)))
        
    t2 = time.time()
    print(f"DB Fetch took: {t2 - t1:.4f}s")
    
    # Stitch
    items_by_order = {}
    for item in items:
        items_by_order.setdefault(item['order_id'], []).append(item)
        
    logs_by_invoice = {}
    for log in logs:
        logs_by_invoice.setdefault(log['invoice_id'], []).append(log)
        
    invoice_by_id = {inv['id']: inv for inv in invoices}
    
    all_orders = []
    for o in base_orders:
        inv = invoice_by_id.get(o['invoice_id'])
        if inv:
            inv_copy = dict(inv)
            inv_copy['logs'] = logs_by_invoice.get(inv['id'], [])
        else:
            inv_copy = None
            
        o_copy = dict(o)
        o_copy['items'] = items_by_order.get(o['id'], [])
        o_copy['invoice'] = inv_copy
        all_orders.append(o_copy)
        
    # Serialize
    def default_serializer(obj):
        return str(obj)
        
    t3 = time.time()
    json_str = json.dumps(all_orders, default=default_serializer)
    t4 = time.time()
    
    print(f"Stitch + JSON serialize took: {t4 - t2:.4f}s")
    print(f"Total size: {len(json_str) / 1024 / 1024:.2f} MB")
    
if __name__ == "__main__":
    main()

import pg8000.dbapi
import ssl
import json

DATABASE_URL = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

url = DATABASE_URL.replace("postgresql://", "")
creds, rest = url.split("@")
username, password = creds.split(":")
host_db = rest.split("?")[0]
host, database = host_db.split("/")

ssl_context = ssl.create_default_context()

try:
    conn = pg8000.dbapi.connect(
        user=username,
        password=password,
        host=host,
        database=database,
        ssl_context=ssl_context
    )
    cursor = conn.cursor()
    
    # Get order info
    cursor.execute(
        "SELECT id, company_id, marketplace, marketplace_order_id, status, invoice_id, shipping_country, currency, total_amount, tax_amount FROM orders WHERE marketplace_order_id = %s",
        ('cz2882073661-A',)
    )
    order = cursor.fetchone()
    print("=== ORDER ===")
    if order:
        order_id = order[0]
        print("ID:", order[0])
        print("Company ID:", order[1])
        print("Marketplace:", order[2])
        print("Marketplace Order ID:", order[3])
        print("Status:", order[4])
        print("Invoice ID:", order[5])
        print("Shipping Country:", order[6])
        print("Currency:", order[7])
        print("Total Amount:", order[8])
        print("Tax Amount:", order[9])
        
        # Get items
        cursor.execute(
            "SELECT sku, title, quantity, unit_price, tax_rate FROM order_items WHERE order_id = %s",
            (order_id,)
        )
        items = cursor.fetchall()
        print("\n=== ITEMS ===")
        for item in items:
            print(f"SKU: {item[0]}, Title: {item[1]}, Qty: {item[2]}, Price: {item[3]}, Tax Rate: {item[4]}")
    else:
        print("Order cz2882073661-A not found!")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Failed:", e)

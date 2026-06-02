import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, name, legal_name, street, zip, city, country, 
               warehouse_street, warehouse_zip, warehouse_city, warehouse_country,
               iban, bic, bank_name, payment_recipient
        FROM companies;
    """)
    colnames = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    
    for row in rows:
        print("COMPANY DETAILS:")
        for col, val in zip(colnames, row):
            print(f"  {col}: {val}")
        print("-" * 40)
        
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()

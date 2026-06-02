import os
import psycopg2

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT DISTINCT marketplace
        FROM orders
        ORDER BY marketplace
    """)
    rows = cur.fetchall()
    print("All distinct marketplace values in orders:")
    for r in rows:
        print(f"- {r[0]}")
        
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()

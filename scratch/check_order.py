import psycopg2
import json

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SELECT id, status, tracking_number, raw_payload FROM orders WHERE marketplace_order_id = 'NL5K767BB74D-A';")
        rows = cur.fetchall()
        for row in rows:
            print(f"ID: {row[0]}")
            print(f"Status: {row[1]}")
            print(f"Tracking Number: {row[2]}")
            print("Raw Payload:")
            print(json.dumps(row[3], indent=2))
            print("-" * 50)
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()

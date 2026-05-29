import psycopg2

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SELECT id, type, client_id, client_secret, api_key, environment FROM marketplace_integrations WHERE type::text LIKE 'mirakl%';")
        rows = cur.fetchall()
        for row in rows:
            print(f"ID: {row[0]}")
            print(f"Type: {row[1]}")
            print(f"Client ID: {row[2]}")
            print(f"Client Secret: {row[3]}")
            print(f"API Key (Audience/Key): {row[4]}")
            print(f"Environment: {row[5]}")
            print("-" * 50)
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()

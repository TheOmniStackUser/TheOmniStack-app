import psycopg2

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT sum(octet_length(note::text)) / 1024 / 1024 as total_mb FROM invoice_logs")
    res = cur.fetchone()
    print(f"Total invoice_logs note MB: {res[0]}")
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

import os
from psycopg2 import connect
db_url = os.environ.get('DATABASE_URL')
if not db_url:
    if os.path.exists('.env.local'):
        with open('.env.local') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.strip().split('=', 1)[1].strip('"\'')
                    break
conn = connect(db_url)
cursor = conn.cursor()
cursor.execute("SELECT marketplace, raw_payload->'customer'->'shipping_address'->>'country_iso_code', raw_payload->'customer'->'shipping_address'->>'country' FROM orders WHERE marketplace ILIKE '%secret sales%'")
for r in cursor.fetchall():
    print(f"{r[0]} | iso: {r[1]} | country: {r[2]}")

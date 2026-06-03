import os
import sys
import json
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
cursor.execute("SELECT marketplace, raw_payload->'channel'->>'code', shipping_country FROM orders WHERE marketplace ILIKE '%secret sales%'")
rows = cursor.fetchall()
summary = {}
for r in rows:
    mp = r[0]
    ch = r[1]
    ctry = r[2]
    key = f"{mp} | {ch} | {ctry}"
    summary[key] = summary.get(key, 0) + 1

for k, v in summary.items():
    print(f"{k} : {v}")

import os
import sys
import json
from psycopg2 import connect
from urllib.parse import urlparse

db_url = os.environ.get('DATABASE_URL')
if not db_url:
    # try reading from .env.local
    if os.path.exists('.env.local'):
        with open('.env.local') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.strip().split('=', 1)[1].strip('"\'')
                    break

if not db_url:
    print("No DATABASE_URL found")
    sys.exit(1)

conn = connect(db_url)
cursor = conn.cursor()
cursor.execute("SELECT id, marketplace, raw_payload FROM orders WHERE marketplace ILIKE '%secret sales%' LIMIT 5")
rows = cursor.fetchall()
if not rows:
    print("No secret sales orders found")
else:
    for row in rows:
        print(f"ID: {row[0]}")
        print(f"Marketplace: {row[1]}")
        payload = row[2]
        if payload:
            print("Channel code:", payload.get('channel', {}).get('code', 'NO CHANNEL CODE'))
        print("-" * 20)

import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # 1. Get all companies
    cur.execute("SELECT id, name, legal_name, street, zip, city, country FROM companies;")
    rows = cur.fetchall()
    print("COMPANIES IN DATABASE:")
    for row in rows:
        print(row)
        
    print("\n-------------------\n")
    
    # 2. Get all members/users
    cur.execute("SELECT id, email, name FROM users;")
    users = cur.fetchall()
    print("USERS IN DATABASE:")
    for u in users:
        print(u)
        
    print("\n-------------------\n")
    
    # 3. Get all company members
    cur.execute("SELECT company_id, user_id, role FROM company_members;")
    members = cur.fetchall()
    print("COMPANY MEMBERS IN DATABASE:")
    for m in members:
        print(m)
        
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()

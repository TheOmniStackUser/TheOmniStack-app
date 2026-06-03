import psycopg2

db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

def main():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    cur.execute("SELECT company_id FROM orders WHERE is_archived = false AND status != 'draft' GROUP BY company_id ORDER BY count(*) DESC LIMIT 1")
    company_id = cur.fetchone()[0]

    cur.execute("""
        SELECT 
          sum(octet_length(id::text)) as id_sz,
          sum(octet_length(company_id::text)) as c_sz,
          sum(octet_length(marketplace::text)) as m_sz,
          sum(octet_length(marketplace_order_id::text)) as mo_sz,
          sum(octet_length(marketplace_purchase_date::text)) as mpd_sz,
          sum(octet_length(status::text)) as st_sz,
          sum(octet_length(total_amount::text)) as ta_sz,
          sum(octet_length(currency::text)) as cu_sz,
          sum(octet_length(buyer_email::text)) as be_sz,
          sum(octet_length(buyer_name::text)) as bn_sz,
          sum(octet_length(shipping_name::text)) as sn_sz,
          sum(octet_length(shipping_street::text)) as ss_sz,
          sum(octet_length(shipping_zip::text)) as sz_sz,
          sum(octet_length(shipping_city::text)) as sc_sz,
          sum(octet_length(shipping_country::text)) as sco_sz,
          sum(octet_length(raw_payload::text)) as rp_sz,
          sum(octet_length(invoice_id::text)) as ii_sz,
          sum(octet_length(is_archived::text)) as ia_sz,
          sum(octet_length(customer_number::text)) as cn_sz,
          sum(octet_length(delivery_note_number::text)) as dnn_sz,
          sum(octet_length(tracking_number::text)) as tn_sz,
          sum(octet_length(label_url::text)) as lu_sz,
          sum(octet_length(return_tracking_number::text)) as rtn_sz,
          sum(octet_length(return_label_url::text)) as rlu_sz,
          sum(octet_length(total_weight::text)) as tw_sz,
          sum(octet_length(created_at::text)) as ca_sz,
          sum(octet_length(updated_at::text)) as ua_sz
        FROM orders t WHERE company_id = %s
    """, (company_id,))
    
    row = cur.fetchone()
    columns = [desc[0] for desc in cur.description]
    for col, sz in zip(columns, row):
        sz_mb = (sz or 0) / 1024 / 1024
        print(f"{col}: {sz_mb:.4f} MB")
        
    cur.close()
    conn.close()
    
if __name__ == "__main__":
    main()

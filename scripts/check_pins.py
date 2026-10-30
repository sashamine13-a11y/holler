"""Check pins table schema and test pinning."""
import psycopg2

CONN = dict(
    host="aws-0-eu-west-2.pooler.supabase.com",
    port=6543,
    user="postgres.favnquxkqqidnfrbxndn",
    password="Holler_19843657",
    dbname="postgres",
    connect_timeout=15,
    sslmode="require",
)

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

print("=== pins columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='pins'
    order by ordinal_position
""")
for c, t in cur.fetchall():
    print(f"  - {c}: {t}")

print("\n=== existing pins ===")
cur.execute("select * from public.pins limit 5")
cols = [d[0] for d in cur.description]
for row in cur.fetchall():
    print(f"  {dict(zip(cols, row))}")

cur.close()
conn.close()

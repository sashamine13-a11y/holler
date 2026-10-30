"""Check messages.media_type constraints + RLS for audio support."""
import psycopg2
import sys

CONN = dict(
    host="aws-0-eu-west-2.pooler.supabase.com",
    port=6543,
    user="postgres.favnquxkqqidnfrbxndn",
    password="Holler_19843657",
    dbname="postgres",
    connect_timeout=15,
    sslmode="require",
)

try:
    conn = psycopg2.connect(**CONN)
except Exception as e:
    print(f"CONNECT FAILED: {e}")
    sys.exit(1)

cur = conn.cursor()

print("=== messages.media_type column ===")
cur.execute("""
    select column_name, data_type, character_maximum_length
    from information_schema.columns
    where table_schema='public' and table_name='messages' and column_name in ('media_type','image','media_url')
""")
for row in cur.fetchall():
    print("  ", row)

print("\n=== check constraints on messages ===")
cur.execute("""
    select conname, pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
""")
rows = cur.fetchall()
if not rows:
    print("  (none)")
for name, definition in rows:
    print(f"  - {name}: {definition}")

print("\n=== pins columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='pins' order by ordinal_position
""")
for row in cur.fetchall():
    print("  ", row)

conn.close()
print("\nOK")

"""Add message_id column to pins table for pinning specific messages."""
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

SQL = """
-- Add message_id column to pins (references messages; nullable for backward compat)
alter table public.pins add column if not exists message_id uuid references public.messages(id) on delete set null;

-- Verify
"""

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

try:
    cur.execute(SQL)
    conn.commit()
    print("DDL applied")
except Exception as e:
    conn.rollback()
    print(f"ERROR: {e}")

# Verify
print("\n=== pins columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='pins'
    order by ordinal_position
""")
for c, t in cur.fetchall():
    print(f"  - {c}: {t}")

# Check existing pins
print("\n=== existing pins ===")
cur.execute("select id, room_id, text, message_id, created_at from public.pins limit 10")
for r in cur.fetchall():
    print(f"  - {r}")

cur.close()
conn.close()

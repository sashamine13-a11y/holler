"""Check DB schema: list tables and key columns."""
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

print("=== TABLES ===")
cur.execute("""
    select table_name from information_schema.tables
    where table_schema='public'
    order by table_name
""")
for (t,) in cur.fetchall():
    print(f"  - {t}")

print("\n=== rooms columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='rooms'
    order by ordinal_position
""")
for c, t in cur.fetchall():
    print(f"  - {c}: {t}")

print("\n=== messages columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='messages'
    order by ordinal_position
""")
for c, t in cur.fetchall():
    print(f"  - {c}: {t}")

print("\n=== profiles columns ===")
cur.execute("""
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='profiles'
    order by ordinal_position
""")
for c, t in cur.fetchall():
    print(f"  - {c}: {t}")

print("\n=== profiles RLS policies ===")
cur.execute("""
    select policyname, cmd, roles::text, qual, with_check
    from pg_policies where schemaname='public' and tablename='profiles'
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== messages RLS policies ===")
cur.execute("""
    select policyname, cmd, roles::text, qual, with_check
    from pg_policies where schemaname='public' and tablename='messages'
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== functions ===")
cur.execute("""
    select routine_name from information_schema.routines
    where routine_schema='public'
""")
for (f,) in cur.fetchall():
    print(f"  - {f}")

cur.close()
conn.close()

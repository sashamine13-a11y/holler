"""Extend messages_media_type_check to allow 'audio' (voice messages)."""
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
stmts = [
    "ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_type_check",
    "ALTER TABLE public.messages ADD CONSTRAINT messages_media_type_check "
    "CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, NULL::text])))",
]
for s in stmts:
    try:
        cur.execute(s)
        conn.commit()
        print("OK:", s[:80])
    except Exception as e:
        conn.rollback()
        print("FAIL:", s[:80], "->", e)
        conn.close()
        sys.exit(1)

cur.execute("""
    select conname, pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
""")
for name, definition in cur.fetchall():
    print(f"  - {name}: {definition}")

conn.close()
print("DONE")

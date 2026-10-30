#!/usr/bin/env python3
"""Check function definitions (SECURITY DEFINER?) for triggers/RPCs."""
import psycopg2

CONN = dict(
    host='aws-0-eu-west-2.pooler.supabase.com',
    port=6543,
    dbname='postgres',
    user='postgres.favnquxkqqidnfrbxndn',
    password='Holler_19843657',
    sslmode='require',
    connect_timeout=15,
)

conn = psycopg2.connect(**CONN)
cur = conn.cursor()
cur.execute("""
    SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
""")
for name, secdef, owner, df in cur.fetchall():
    print('='*70)
    print(f'{name}  SECURITY DEFINER={secdef}  owner={owner}')
    print(df[:1500])
conn.close()

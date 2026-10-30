#!/usr/bin/env python3
"""Execute schema-v2.sql on Supabase PostgreSQL."""
import psycopg2
import sys

HOST = 'aws-0-eu-west-2.pooler.supabase.com'
PORT = 6543
USER = 'postgres.favnquxkqqidnfrbxndn'
PASSWORD = 'Holler_19843657'
DB = 'postgres'

SQL_FILE = '/home/z/my-project/deploy/supabase/schema-v2.sql'

conn = psycopg2.connect(
    host=HOST, port=PORT, user=USER, password=PASSWORD,
    dbname=DB, connect_timeout=15, sslmode='require',
)
conn.autocommit = False
cur = conn.cursor()

with open(SQL_FILE) as f:
    sql = f.read()

# Run the whole script; transaction mode pooler supports multi-statement via execute
try:
    cur.execute(sql)
    conn.commit()
    print('=== SQL v2 EXECUTED OK ===')
except Exception as e:
    conn.rollback()
    print(f'ERROR: {e}')
    # Print each statement one by one to find the failing one
    print('\nRetrying statement by statement...')
    stmts = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]
    ok = 0
    for i, stmt in enumerate(stmts):
        # Skip pure comment blocks
        lines = [l for l in stmt.split('\n') if l.strip() and not l.strip().startswith('--')]
        if not lines:
            continue
        try:
            cur.execute(stmt)
            conn.commit()
            ok += 1
        except Exception as e2:
            conn.rollback()
            first_line = lines[0][:80]
            print(f'  stmt {i} FAILED: {e2}')
            print(f'    -> {first_line}')
    print(f'\nDone: {ok} statements applied individually')
    sys.exit(1)

# Verify schema
print('\n=== Verification ===')
cur.execute("""
    select table_name from information_schema.tables
    where table_schema='public' order by table_name;
""")
print('tables:', [r[0] for r in cur.fetchall()])

cur.execute("""
    select column_name from information_schema.columns
    where table_schema='public' and table_name='rooms' order by ordinal_position;
""")
print('rooms cols:', [r[0] for r in cur.fetchall()])

cur.execute("""
    select column_name from information_schema.columns
    where table_schema='public' and table_name='messages' order by ordinal_position;
""")
print('messages cols:', [r[0] for r in cur.fetchall()])

cur.execute("""
    select proname from pg_proc where pronamespace='public'::regnamespace;
""")
print('functions:', [r[0] for r in cur.fetchall()])

cur.close()
conn.close()
print('\n=== ALL DONE ===')

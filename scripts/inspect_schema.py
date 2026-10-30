#!/usr/bin/env python3
"""Inspect Supabase schema: tables, columns, RLS policies, RPCs."""
import psycopg2
import psycopg2.extras

CONN = dict(
    host='aws-0-eu-west-2.pooler.supabase.com',
    port=6543,
    dbname='postgres',
    user='postgres.favnquxkqqidnfrbxndn',
    password='Holler_19843657',
    sslmode='require',
    connect_timeout=15,
)

def q(cur, sql):
    cur.execute(sql)
    return cur.fetchall()

def main():
    conn = psycopg2.connect(**CONN)
    cur = conn.cursor()

    print('=== TABLES ===')
    for (t,) in q(cur, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"):
        print(' -', t)

    print('\n=== COLUMNS (rooms, room_members, profiles) ===')
    cur.execute("""
        SELECT table_name, column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name IN ('rooms','room_members','profiles','pins')
        ORDER BY table_name, ordinal_position
    """)
    for r in cur.fetchall():
        print(' |', r)

    print('\n=== RLS POLICIES ===')
    cur.execute("""
        SELECT tablename, policyname, cmd, qual, with_check
        FROM pg_policies WHERE schemaname='public'
        ORDER BY tablename, policyname
    """)
    for r in cur.fetchall():
        print(' *', r[0], '|', r[1], '|', r[2])
        print('    USING:', (r[3] or '')[:300])
        print('    CHECK:', (r[4] or '')[:300])

    print('\n=== FUNCTIONS ===')
    cur.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public'
    """)
    for r in cur.fetchall():
        print(' f', r)

    print('\n=== TRIGGERS ===')
    cur.execute("""
        SELECT event_object_table, trigger_name, action_statement
        FROM information_schema.triggers WHERE trigger_schema='public'
    """)
    for r in cur.fetchall():
        print(' t', r[0], '|', r[1], '|', (r[2] or '')[:200])

    print('\n=== room_members sample ===')
    try:
        cur.execute("SELECT room_id, count(*) FROM room_members GROUP BY 1 LIMIT 10")
        for r in cur.fetchall():
            print(' m', r)
    except Exception as e:
        print('  err:', e)
        conn.rollback()

    print('\n=== rooms sample ===')
    try:
        cur.execute("SELECT id, name, kind, room_type, category, created_by IS NOT NULL FROM rooms ORDER BY created_at LIMIT 20")
        for r in cur.fetchall():
            print(' r', r)
    except Exception as e:
        print('  err:', e)
        conn.rollback()

    conn.close()

if __name__ == '__main__':
    main()

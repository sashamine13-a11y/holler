#!/usr/bin/env python3
"""Inspect current Holler DB state: profiles columns, rooms, privileged users."""
import psycopg2

CONN = dict(
    host='aws-0-eu-west-2.pooler.supabase.com',
    port=6543,
    dbname='postgres',
    user='postgres.favnquxkqqidnfrbxndn',
    password='Holler_19843657',
    sslmode='require',
    connect_timeout=20,
)

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

print('=== profiles columns ===')
cur.execute("""
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema='public' and table_name='profiles'
    order by ordinal_position
""")
for c in cur.fetchall():
    print(' ', c)

print('\n=== profiles (id, email, name, role, avatar present?) ===')
cur.execute("select id, email, name, role, (avatar is not null) as has_avatar from profiles order by created_at limit 30")
for r in cur.fetchall():
    print(' ', r)

print('\n=== rooms ===')
cur.execute("select id, name, kind, room_type, category, comments_enabled from rooms order by created_at")
for r in cur.fetchall():
    print(' ', r)

print('\n=== privileged users ===')
cur.execute("select email, role from profiles where role in ('admin','dev')")
print(' ', cur.fetchall())

print('\n=== channel_comments table exists? ===')
cur.execute("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='channel_comments')")
print(' ', cur.fetchone())

print('\n=== is_dev function exists? ===')
cur.execute("select exists(select 1 from pg_proc where proname='is_dev')")
print(' ', cur.fetchone())

conn.close()

#!/usr/bin/env python3
"""
Holler migration v8:
  1) rooms.username — required for channels/groups (NOT NULL), derived from name on backfill
  2) unique index on lower(rooms.username) WHERE room_type IN ('channel','group')
  3) CHECK constraint: ^[a-z0-9_]{3,20}$
  4) Backfill from name (sanitized, deduplicated against existing usernames)
Idempotent.
"""
import re
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


def sanitize(name: str) -> str:
    s = (name or '').lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if len(s) < 3:
        s = (s + 'channel')[:20]
    return s[:20]


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()

    print('=== 1. rooms.username column ===')
    cur.execute("ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS username text")
    cur.execute("ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_username_check")
    cur.execute("ALTER TABLE public.rooms ADD CONSTRAINT rooms_username_check "
                "CHECK (room_type = 'dm' OR username IS NULL OR username ~ '^[a-z0-9_]{3,20}$')")
    # unique among channels/groups (partial index)
    cur.execute("DROP INDEX IF EXISTS rooms_username_unique_idx")
    cur.execute("""
        CREATE UNIQUE INDEX rooms_username_unique_idx
        ON public.rooms (lower(username))
        WHERE room_type IN ('channel', 'group')
    """)
    print('  column + check + unique index ready')

    print('=== 2. Backfill username from name for channels/groups ===')
    cur.execute("SELECT id, name, username FROM public.rooms WHERE room_type IN ('channel','group') AND (username IS NULL OR username = '')")
    rows = cur.fetchall()
    if not rows:
        print('  none to backfill')
    else:
        # gather existing usernames
        cur.execute("SELECT lower(username) FROM public.rooms WHERE username IS NOT NULL")
        used = set(r[0] for r in cur.fetchall() if r[0])
        for rid, name, _ in rows:
            base = sanitize(name)
            cand = base; n = 2
            while cand.lower() in used:
                suffix = f'_{n}'
                cand = (base[:20 - len(suffix)] + suffix); n += 1
                if n > 9999:
                    cand = ('r' + rid.replace('-', ''))[:20]; break
            used.add(cand.lower())
            cur.execute("UPDATE public.rooms SET username = %s WHERE id = %s", (cand, rid))
            print(f'  {name} -> @{cand}')

    print('=== 3. Make username NOT NULL for channels/groups ===')
    # Set a default for any remaining NULL (shouldn't happen after backfill, but safety)
    cur.execute("UPDATE public.rooms SET username = 'channel' WHERE room_type IN ('channel','group') AND (username IS NULL OR username = '')")
    # We can't do a NOT NULL on a column that allows NULL for DMs, so instead add a CHECK:
    cur.execute("ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_username_required_check")
    cur.execute("ALTER TABLE public.rooms ADD CONSTRAINT rooms_username_required_check "
                "CHECK (room_type = 'dm' OR (username IS NOT NULL AND username ~ '^[a-z0-9_]{3,20}$'))")
    print('  username required for channels/groups')

    conn.commit()

    print('\n=== VERIFY ===')
    cur.execute("SELECT name, room_type, username FROM public.rooms ORDER BY created_at")
    for r in cur.fetchall():
        print(' ', r)
    cur.execute("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='rooms' AND column_name='username'")
    print('column:', cur.fetchone())
    cur.execute("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='rooms' AND indexname='rooms_username_unique_idx'")
    print('unique index:', cur.fetchone())
    conn.close()
    print('\nDONE')


if __name__ == '__main__':
    main()

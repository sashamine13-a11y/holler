#!/usr/bin/env python3
"""
Holler migration v4: add @username handles to users.

- profiles.username  (text, nullable, lowercase, unique)
- CHECK constraint: ^[a-z0-9_]{3,20}$
- unique index on lower(username) where not null
- backfill every existing profile from its email local-part (sanitized, de-duplicated)
- RLS: profiles UPDATE policy already lets a user update their own row (incl. username).
  Unique violations on concurrent edits are caught client-side.

Idempotent: safe to run twice.
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

UNAME_RE = re.compile(r'^[a-z0-9_]{3,20}$')


def sanitize(local: str) -> str:
    s = local.lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if len(s) < 3:
        s = (s + 'user')[:20]
    return s[:20]


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()

    print('=== 1. Add username column + constraint + unique index ===')
    cur.execute("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text")
    # drop old check if rerun, then add fresh
    cur.execute("ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_check")
    cur.execute(
        "ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_check "
        "CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$')"
    )
    # unique index (partial — only non-null)
    cur.execute("""
        DROP INDEX IF EXISTS profiles_username_unique_idx
    """)
    cur.execute("""
        CREATE UNIQUE INDEX profiles_username_unique_idx
        ON public.profiles (lower(username))
        WHERE username IS NOT NULL
    """)
    print('  column + check + unique index OK')

    print('=== 2. Backfill usernames from email local-part ===')
    cur.execute("SELECT id, email, COALESCE(username,'') FROM public.profiles ORDER BY created_at")
    rows = cur.fetchall()
    used: set[str] = set()
    # seed with already-set usernames
    for _, _, u in rows:
        if u:
            used.add(u.lower())
    updates = 0
    for pid, email, existing in rows:
        if existing:
            continue
        base = sanitize(email.split('@')[0])
        candidate = base
        n = 2
        while candidate.lower() in used or not UNAME_RE.match(candidate):
            suffix = f'_{n}'
            candidate = (base[:20 - len(suffix)] + suffix)
            n += 1
            if n > 9999:
                candidate = f'u{pid.replace("-","")[:18]}'
                break
        used.add(candidate.lower())
        cur.execute("UPDATE public.profiles SET username = %s WHERE id = %s", (candidate, pid))
        updates += 1
        print(f'  {email}  ->  @{candidate}')
    print(f'  backfilled {updates} profile(s)')

    print('=== 3. Make username NOT NULL ===')
    # now every row has one; enforce NOT NULL so future inserts must supply it.
    cur.execute("UPDATE public.profiles SET username = COALESCE(username, 'user') WHERE username IS NULL")
    cur.execute("ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL")
    print('  username is now NOT NULL')

    conn.commit()

    print('\n=== VERIFY ===')
    cur.execute("SELECT email, name, username, role FROM public.profiles ORDER BY created_at")
    for r in cur.fetchall():
        print(' ', r)
    cur.execute("""
        SELECT column_name, is_nullable, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='username'
    """)
    print('column meta:', cur.fetchone())
    cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='profiles' AND indexname='profiles_username_unique_idx'")
    print('index:', cur.fetchone())
    conn.close()
    print('\nDONE')


if __name__ == '__main__':
    main()

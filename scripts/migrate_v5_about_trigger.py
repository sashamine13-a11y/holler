#!/usr/bin/env python3
"""
Holler migration v5:
  1) profiles.about  (text, nullable) — user bio
  2) handle_new_user() updated: username from raw_user_meta_data->>'username'
     if provided & valid; else sanitized from name (not email) — deduplicated.
     username stays NOT NULL (always present, unique).
  3) Backfill any NULL usernames from name (sanitized, deduplicated).

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

UNAME_RE = re.compile(r'^[a-z0-9_]{3,20}$')


def sanitize(s: str) -> str:
    s = (s or '').lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if len(s) < 3:
        s = (s + 'user')[:20]
    return s[:20]


FN = r"""
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  base text;
  candidate text;
  uname text;
  n int;
begin
  -- username from sign-up form (optional) — validate strictly
  uname := new.raw_user_meta_data->>'username';
  if uname is null or not (uname ~ '^[a-z0-9_]{3,20}$') then
    uname := null;
  end if;

  if uname is not null then
    -- dedupe even if user-provided (safety net)
    candidate := uname;
    n := 2;
    while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
      candidate := substr(uname, 1, 20 - length('_' || n::text)) || '_' || n::text;
      n := n + 1;
      if n > 9999 then
        candidate := substr('u' || replace(new.id::text, '-', ''), 1, 20);
        exit;
      end if;
    end loop;
    uname := candidate;
  else
    -- default: sanitized name (fallback to email local-part if name is empty/non-latin)
    base := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
    base := lower(base);
    base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
    base := regexp_replace(base, '_+', '_', 'g');
    base := trim(both '_' from base);
    if char_length(base) < 3 then
      base := substr(base || split_part(new.email, '@', 1), 1, 20);
      base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
      base := regexp_replace(base, '_+', '_', 'g');
      base := trim(both '_' from base);
    end if;
    if char_length(base) < 3 then
      base := 'user';
    end if;
    base := substr(base, 1, 20);

    candidate := base;
    n := 2;
    while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
      candidate := substr(base, 1, 20 - length('_' || n::text)) || '_' || n::text;
      n := n + 1;
      if n > 9999 then
        candidate := substr('u' || replace(new.id::text, '-', ''), 1, 20);
        exit;
      end if;
    end loop;
    uname := candidate;
  end if;

  insert into public.profiles (id, email, name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    uname
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
"""


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()

    print('=== 1. profiles.about column ===')
    cur.execute("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS about text")
    print('  about column ready')

    print('=== 2. handle_new_user() updated (username from meta or name) ===')
    cur.execute(FN)
    print('  function replaced')

    print('=== 3. Backfill any NULL usernames from name ===')
    cur.execute("SELECT id, name, email, username FROM public.profiles WHERE username IS NULL OR username = ''")
    rows = cur.fetchall()
    if not rows:
        print('  none to backfill')
    else:
        used = set()
        cur.execute("SELECT lower(username) FROM public.profiles WHERE username IS NOT NULL")
        for (u,) in cur.fetchall():
            used.add(u)
        for pid, name, email, _ in rows:
            base = sanitize(name) if name and sanitize(name) != 'user' else sanitize(email.split('@')[0])
            cand = base; n = 2
            while cand.lower() in used:
                cand = (base[:20 - len(f'_{n}')] + f'_{n}'); n += 1
                if n > 9999:
                    cand = ('u' + pid.replace('-', ''))[:20]; break
            used.add(cand.lower())
            cur.execute("UPDATE public.profiles SET username = %s WHERE id = %s", (cand, pid))
            print(f'  {email} -> @{cand}')

    conn.commit()

    print('\n=== VERIFY ===')
    cur.execute("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('username','about') ORDER BY column_name")
    for r in cur.fetchall():
        print(' ', r)
    cur.execute("SELECT email, name, username, left(about,30) FROM public.profiles ORDER BY created_at LIMIT 5")
    for r in cur.fetchall():
        print(' ', r)
    conn.close()
    print('\nDONE')


if __name__ == '__main__':
    main()

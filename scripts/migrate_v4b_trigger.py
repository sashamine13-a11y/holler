#!/usr/bin/env python3
"""
Holler v4b: update handle_new_user() trigger function so new sign-ups get a
unique @username (username column is NOT NULL since v4).

Derives a base from the email local-part, sanitizes to [a-z0-9_]{3,20}, and
de-duplicates against existing profiles by appending _2, _3, …
"""
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
  n int;
begin
  base := lower(split_part(new.email, '@', 1));
  base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
  base := regexp_replace(base, '_+', '_', 'g');
  base := trim(both '_' from base);
  if char_length(base) < 3 then
    base := substr(base || 'user', 1, 20);
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

  insert into public.profiles (id, email, name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    candidate
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
"""

conn = psycopg2.connect(**CONN)
conn.autocommit = False
cur = conn.cursor()
cur.execute(FN)
conn.commit()
print('handle_new_user() updated')

# verify
cur.execute("select pg_get_functiondef('public.handle_new_user()'::regprocedure)")
print(cur.fetchone()[0])
conn.close()
print('DONE')

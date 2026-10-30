"""
Apply schema fixes:
1. Profiles: allow authenticated users to read ALL profiles (needed for member list, DM creation, group creation)
2. Auto-confirm new sign-ups (set email_confirmed_at = now() on insert) — bypasses email confirmation
3. Ensure messages UPDATE policy covers edit (already does)
4. Enable realtime on room_members (already done in v2)
"""
import psycopg2

CONN = dict(
    host="aws-0-eu-west-2.pooler.supabase.com",
    port=6543,
    user="postgres.favnquxkqqidnfrbxndn",
    password="Holler_19843657",
    dbname="postgres",
    connect_timeout=15,
    sslmode="require",
)

SQL = """
-- ============================================================================
-- 1. Profiles: allow all authenticated users to read all profiles
--    (needed for member list, DM creation, group creation)
-- ============================================================================
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Authenticated can read all profiles" on public.profiles;
create policy "Authenticated can read all profiles"
  on public.profiles for select to authenticated using (true);

-- Keep insert/update to own profile only
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- ============================================================================
-- 2. Auto-confirm new signups (sets email_confirmed_at immediately)
--    This bypasses email confirmation requirement
-- ============================================================================
create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_autoconfirm on auth.users;
create trigger on_auth_user_autoconfirm
  before insert on auth.users
  for each row execute function public.auto_confirm_user();

-- ============================================================================
-- 3. Ensure messages UPDATE policy covers edit too
-- ============================================================================
drop policy if exists "Users can soft delete own messages" on public.messages;
drop policy if exists "Users can update own messages" on public.messages;
create policy "Users can update own messages"
  on public.messages for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ============================================================================
-- 4. Verify realtime is enabled for room_members (v2 already did this)
-- ============================================================================
alter table public.room_members replica identity full;
"""

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

# Run each statement separately to get better error reporting
import re
statements = [s.strip() for s in SQL.split(';') if s.strip() and not s.strip().startswith('--')]
for i, stmt in enumerate(statements, 1):
  # Skip pure comment blocks
  lines = [l for l in stmt.split('\n') if l.strip() and not l.strip().startswith('--')]
  if not lines:
    continue
  print(f"\n--- Statement {i} ---")
  preview = ' '.join(stmt.split())[:120]
  print(f"  {preview}...")
  try:
    cur.execute(stmt)
    conn.commit()
    print(f"  OK")
  except Exception as e:
    conn.rollback()
    print(f"  ERROR: {e}")

# Verify
print("\n=== Verifying profiles RLS policies ===")
cur.execute("""
    select policyname, cmd, qual, with_check
    from pg_policies where schemaname='public' and tablename='profiles'
    order by policyname
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== Verifying messages RLS policies ===")
cur.execute("""
    select policyname, cmd, qual, with_check
    from pg_policies where schemaname='public' and tablename='messages'
    order by policyname
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== Verifying trigger on auth.users ===")
cur.execute("""
    select trigger_name, event_manipulation, action_timing
    from information_schema.triggers
    where event_object_schema='auth' and event_object_table='users'
""")
for r in cur.fetchall():
    print(f"  - {r}")

cur.close()
conn.close()
print("\nDone.")

"""Clean up duplicate policies + create the auto-confirm function/trigger."""
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

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

# Run as single SQL block (psycopg2 handles dollar-quoting when sent as one execute)
SQL = r"""
-- Drop duplicate / leftover policies
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can soft delete own messages" on public.messages;

-- Create auto-confirm function (BEFORE INSERT on auth.users)
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
"""

try:
    cur.execute(SQL)
    conn.commit()
    print("All SQL applied successfully")
except Exception as e:
    conn.rollback()
    print(f"ERROR: {e}")

# Verify
print("\n=== Final profiles policies ===")
cur.execute("""
    select policyname, cmd from pg_policies
    where schemaname='public' and tablename='profiles' order by policyname
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== Final messages policies ===")
cur.execute("""
    select policyname, cmd from pg_policies
    where schemaname='public' and tablename='messages' order by policyname
""")
for r in cur.fetchall():
    print(f"  - {r}")

print("\n=== auth.users triggers ===")
cur.execute("""
    select trigger_name, event_manipulation, action_timing, action_statement
    from information_schema.triggers
    where event_object_schema='auth' and event_object_table='users'
    order by trigger_name
""")
for r in cur.fetchall():
    print(f"  - {r}")

# Test the function
print("\n=== Test: auto_confirm_user function exists ===")
cur.execute("select proname from pg_proc where proname='auto_confirm_user'")
for r in cur.fetchall():
    print(f"  - function: {r[0]}")

cur.close()
conn.close()
print("\nDone.")

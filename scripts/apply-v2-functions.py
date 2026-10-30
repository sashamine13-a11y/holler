#!/usr/bin/env python3
"""Apply remaining schema-v2 pieces (functions with $$ quoting) + verify."""
import psycopg2

conn = psycopg2.connect(
    host='aws-0-eu-west-2.pooler.supabase.com', port=6543,
    user='postgres.favnquxkqqidnfrbxndn', password='Holler_19843657',
    dbname='postgres', connect_timeout=15, sslmode='require',
)
conn.autocommit = True
cur = conn.cursor()

# 1. Check what functions exist
cur.execute("select proname from pg_proc where pronamespace='public'::regnamespace order by 1;")
fns = [r[0] for r in cur.fetchall()]
print('existing functions:', fns)

# 2. handle_new_room trigger function (create or replace — idempotent)
cur.execute("""
create or replace function public.handle_new_room()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end;
$$;
""")
print('handle_new_room: OK')

# 3. get_or_create_dm function
cur.execute("""
create or replace function public.get_or_create_dm(user1 uuid, user2 uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  room_id uuid;
begin
  select id into room_id
  from public.rooms
  where room_type = 'dm'
    and ((dm_user1 = user1 and dm_user2 = user2) or (dm_user1 = user2 and dm_user2 = user1))
  limit 1;

  if room_id is null then
    insert into public.rooms (name, kind, room_type, dm_user1, dm_user2, created_by)
    values ('DM', 'chat', 'dm', user1, user2, user1)
    returning id into room_id;

    insert into public.room_members (room_id, user_id) values (room_id, user1), (room_id, user2)
    on conflict do nothing;
  end if;

  return room_id;
end;
$$;
""")
print('get_or_create_dm: OK')

# 4. Trigger on rooms
cur.execute("drop trigger if exists on_room_created on public.rooms;")
cur.execute("""
create trigger on_room_created
  after insert on public.rooms
  for each row execute function public.handle_new_room();
""")
print('trigger on_room_created: OK')

# 5. Verify everything
print('\n=== Verification ===')
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
    select column_name from information_schema.columns
    where table_schema='public' and table_name='room_members' order by ordinal_position;
""")
print('room_members cols:', [r[0] for r in cur.fetchall()])

cur.execute("select proname from pg_proc where pronamespace='public'::regnamespace order by 1;")
print('functions now:', [r[0] for r in cur.fetchall()])

cur.execute("select tgname from pg_trigger where tgrelid='public.rooms'::regclass and not tgisinternal;")
print('triggers on rooms:', [r[0] for r in cur.fetchall()])

# 6. Test get_or_create_dm with the two existing profiles
cur.execute("select id, name from public.profiles limit 2;")
profiles = cur.fetchall()
if len(profiles) == 2:
    u1, u2 = profiles[0][0], profiles[1][0]
    cur.execute("select public.get_or_create_dm(%s, %s);", (u1, u2))
    dm_id = cur.fetchone()[0]
    print(f'\nget_or_create_dm test: OK (room {dm_id})')
    cur.execute("select room_type, dm_user1, dm_user2 from public.rooms where id=%s;", (dm_id,))
    print('  room row:', cur.fetchone())
    cur.execute("select count(*) from public.room_members where room_id=%s;", (dm_id,))
    print('  members count:', cur.fetchone()[0])

cur.close()
conn.close()
print('\n=== ALL DONE ===')

-- Holler v2 schema update — full messenger features
-- Execute in Supabase SQL Editor

-- ============================================================================
-- 1. Update rooms table — add room_type for DMs and groups
-- ============================================================================
alter table public.rooms add column if not exists room_type text not null default 'channel' check (room_type in ('channel', 'dm', 'group'));
alter table public.rooms add column if not exists dm_user1 uuid references public.profiles(id);
alter table public.rooms add column if not exists dm_user2 uuid references public.profiles(id);

-- ============================================================================
-- 2. Room members — for group chats
-- ============================================================================
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);

alter table public.room_members enable row level security;
create policy "Members can read room members" on public.room_members for select to authenticated using (true);
create policy "Authenticated can join rooms" on public.room_members for insert to authenticated with check (true);
create policy "Members can leave rooms" on public.room_members for delete to authenticated using (user_id = auth.uid());

-- ============================================================================
-- 3. Update messages — add reply, forward, soft delete
-- ============================================================================
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists forwarded_from text;
alter table public.messages add column if not exists forwarded_by uuid references public.profiles(id);
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists media_type text check (media_type in ('image', 'video', null));
alter table public.messages add column if not exists media_url text;

-- ============================================================================
-- 4. Update RLS for messages — allow soft delete by author
-- ============================================================================
drop policy if exists "Users can delete own messages" on public.messages;
create policy "Users can soft delete own messages" on public.messages for update to authenticated using (author_id = auth.uid());

-- ============================================================================
-- 5. Auto-add room creator as member
-- ============================================================================
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

drop trigger if exists on_room_created on public.rooms;
create trigger on_room_created
  after insert on public.rooms
  for each row execute function public.handle_new_room();

-- ============================================================================
-- 6. Function to create or get DM room between two users
-- ============================================================================
create or replace function public.get_or_create_dm(user1 uuid, user2 uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  room_id uuid;
begin
  -- Check if DM already exists
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

-- ============================================================================
-- 7. Enable realtime for room_members
-- ============================================================================
alter table public.room_members replica identity full;

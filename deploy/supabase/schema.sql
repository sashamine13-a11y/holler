-- Holler database schema for Supabase
-- Выполнить в Supabase Dashboard → SQL Editor → New query

-- ============================================================================
-- PROFILES (extension of auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  name text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  avatar text,
  secret_question text,
  secret_answer_hash text,
  secret_answer_salt text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- ============================================================================
-- ROOMS
-- ============================================================================
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('channel', 'chat')),
  category text,
  about text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
create policy "Authenticated can read rooms" on public.rooms for select to authenticated using (true);
create policy "Authenticated can create rooms" on public.rooms for insert to authenticated with check (true);
create policy "Authenticated can update rooms" on public.rooms for update to authenticated using (true);
create policy "Authenticated can delete rooms" on public.rooms for delete to authenticated using (true);

-- ============================================================================
-- MESSAGES
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_role text,
  text text,
  image text,
  is_anonymous boolean default false,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create policy "Authenticated can read messages" on public.messages for select to authenticated using (true);
create policy "Authenticated can send messages" on public.messages for insert to authenticated with check (true);
create policy "Users can delete own messages" on public.messages for delete to authenticated using (author_id = auth.uid());

-- ============================================================================
-- POLLS
-- ============================================================================
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  question text not null,
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.polls enable row level security;
create policy "Authenticated can read polls" on public.polls for select to authenticated using (true);
create policy "Authenticated can create polls" on public.polls for insert to authenticated with check (true);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  text text not null,
  position int not null default 0
);

alter table public.poll_options enable row level security;
create policy "Authenticated can read poll options" on public.poll_options for select to authenticated using (true);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(poll_id, user_id)
);

alter table public.poll_votes enable row level security;
create policy "Authenticated can read votes" on public.poll_votes for select to authenticated using (true);
create policy "Authenticated can vote" on public.poll_votes for insert to authenticated with check (user_id = auth.uid());

-- ============================================================================
-- PINS
-- ============================================================================
create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  text text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(room_id)
);

alter table public.pins enable row level security;
create policy "Authenticated can read pins" on public.pins for select to authenticated using (true);
create policy "Authenticated can create pins" on public.pins for insert to authenticated with check (true);
create policy "Authenticated can delete pins" on public.pins for delete to authenticated using (true);

-- ============================================================================
-- ANONYMOUS QUESTIONS
-- ============================================================================
create table if not exists public.anon_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  question text not null,
  author_id uuid references public.profiles(id),
  answered boolean default false,
  created_at timestamptz not null default now()
);

alter table public.anon_questions enable row level security;
create policy "Authenticated can read anon questions" on public.anon_questions for select to authenticated using (true);
create policy "Authenticated can create anon questions" on public.anon_questions for insert to authenticated with check (true);

create table if not exists public.anon_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.anon_questions(id) on delete cascade not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.anon_answers enable row level security;
create policy "Authenticated can read anon answers" on public.anon_answers for select to authenticated using (true);
create policy "Authenticated can create anon answers" on public.anon_answers for insert to authenticated with check (true);

-- ============================================================================
-- REALTIME — enable for all tables
-- ============================================================================
alter table public.messages replica identity full;
alter table public.polls replica identity full;
alter table public.poll_votes replica identity full;
alter table public.pins replica identity full;
alter table public.anon_questions replica identity full;
alter table public.anon_answers replica identity full;

-- ============================================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- STARTER DATA — default rooms
-- ============================================================================
insert into public.rooms (name, kind, category, about) values
  ('Announcements', 'channel', 'announcements', 'Schedule changes, deadlines, important stuff'),
  ('Class Life', 'channel', 'life', 'Photos, stories, memes'),
  ('Study', 'channel', 'study', 'Homework, notes, cheat sheets'),
  ('Marketplace', 'channel', 'shop', 'Sell, buy, give away'),
  ('General Chat', 'chat', 'general', 'Class communication')
on conflict do nothing;

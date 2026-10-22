-- PK Filmes — Supabase schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every object is created with IF NOT EXISTS or replaced.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (1 row per auth.users row)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text,
  color text not null default '#6a5acd',
  plan text not null default 'Grátis',
  plan_id text not null default 'free',
  bio text not null default '',
  favorite_genre text not null default 'Ficção',
  joined date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create the profile row after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Watchlist and playback history
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table public.watchlist enable row level security;
drop policy if exists "watchlist_own" on public.watchlist;
create policy "watchlist_own"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.history (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null,
  progress numeric not null default 0,
  duration numeric not null default 0,
  episode jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table public.history enable row level security;
drop policy if exists "history_own" on public.history;
create policy "history_own"
  on public.history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_related" on public.friendships;
create policy "friendships_select_related"
  on public.friendships for select
  using (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester"
  on public.friendships for insert
  with check (auth.uid() = requester and status = 'pending');

drop policy if exists "friendships_update_related" on public.friendships;
create policy "friendships_update_related"
  on public.friendships for update
  using (auth.uid() = requester or auth.uid() = addressee)
  with check (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "friendships_delete_related" on public.friendships;
create policy "friendships_delete_related"
  on public.friendships for delete
  using (auth.uid() = requester or auth.uid() = addressee);

-- Directory used by the friends page (safe columns only, no e-mail).
create or replace view public.profile_directory
with (security_invoker = true)
as
select id, name, color, plan, bio, favorite_genre, joined
from public.profiles;

-- ---------------------------------------------------------------------------
-- Watch party rooms
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  host uuid not null references auth.users (id) on delete cascade,
  movie_id text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "rooms_select_public_or_member" on public.rooms;
create policy "rooms_select_public_or_member"
  on public.rooms for select
  using (
    is_private = false
    or host = auth.uid()
    or exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "rooms_insert_host" on public.rooms;
create policy "rooms_insert_host"
  on public.rooms for insert
  with check (host = auth.uid());

drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host"
  on public.rooms for update
  using (host = auth.uid())
  with check (host = auth.uid());

drop policy if exists "rooms_delete_host" on public.rooms;
create policy "rooms_delete_host"
  on public.rooms for delete
  using (host = auth.uid());

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_members enable row level security;

drop policy if exists "room_members_select_member" on public.room_members;
create policy "room_members_select_member"
  on public.room_members for select
  using (user_id = auth.uid() or exists (
    select 1 from public.room_members mine
    where mine.room_id = room_members.room_id and mine.user_id = auth.uid()
  ));

drop policy if exists "room_members_insert_self" on public.room_members;
create policy "room_members_insert_self"
  on public.room_members for insert
  with check (user_id = auth.uid());

drop policy if exists "room_members_delete_self" on public.room_members;
create policy "room_members_delete_self"
  on public.room_members for delete
  using (user_id = auth.uid());

create table if not exists public.room_messages (
  id bigint generated by default as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.room_messages enable row level security;

drop policy if exists "room_messages_select_member" on public.room_messages;
create policy "room_messages_select_member"
  on public.room_messages for select
  using (exists (
    select 1 from public.room_members m
    where m.room_id = room_messages.room_id and m.user_id = auth.uid()
  ));

drop policy if exists "room_messages_insert_member" on public.room_messages;
create policy "room_messages_insert_member"
  on public.room_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.room_members m
      where m.room_id = room_messages.room_id and m.user_id = auth.uid()
    )
  );

-- Realtime for chat and room presence (ignore the error if already added).
do $$
begin
  alter publication supabase_realtime add table public.room_messages;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket for avatars (optional)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_own_write" on storage.objects;
create policy "avatars_own_write"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

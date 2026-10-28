-- w00filmes — social layer (friends, rooms, realtime chat, avatars)
-- Run after 001/schema.sql. Safe to re-run.

alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.rooms add column if not exists playback_state jsonb not null default '{}'::jsonb;

alter table public.room_messages add column if not exists client_id uuid not null default gen_random_uuid();
alter table public.room_messages add column if not exists sender_name text;
alter table public.room_messages add column if not exists sender_avatar text;
create unique index if not exists room_messages_client_id_key on public.room_messages (client_id);

-- ---------------------------------------------------------------------------
-- Avatars: public read, each user writes only inside their own folder.
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

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- Friends: safe profile search + state + mutations (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
create or replace function public.search_profiles(p_query text default '')
returns table (
  id uuid,
  name text,
  avatar_url text,
  favorite_genre text,
  relation text,
  friendship_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select
    p.id,
    p.name,
    p.avatar_url,
    p.favorite_genre,
    case
      when f.status = 'accepted' then 'friend'
      when f.status = 'pending' and f.requester = me.uid then 'sent'
      when f.status = 'pending' and f.addressee = me.uid then 'received'
      else 'none'
    end as relation,
    f.id
  from public.profiles p
  cross join me
  left join lateral (
    select f.*
    from public.friendships f
    where (f.requester = me.uid and f.addressee = p.id)
       or (f.addressee = me.uid and f.requester = p.id)
    order by (f.status = 'accepted') desc, f.updated_at desc
    limit 1
  ) f on true
  where me.uid is not null
    and p.id <> me.uid
    and coalesce(p.email, '') not ilike '%@example.com'
    and (
      coalesce(p_query, '') = ''
      or p.name ilike '%' || p_query || '%'
      or p.email ilike '%' || p_query || '%'
    )
  order by
    (lower(p.name) = lower(coalesce(p_query, ''))) desc,
    (p.name ilike coalesce(p_query, '') || '%') desc,
    p.name
  limit 30;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

create or replace function public.friends_state()
returns table (
  friendship_id uuid,
  other_id uuid,
  name text,
  avatar_url text,
  favorite_genre text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    p.id,
    p.name,
    p.avatar_url,
    p.favorite_genre,
    f.status,
    case when f.requester = auth.uid() then 'sent' else 'received' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

revoke all on function public.friends_state() from public;
grant execute on function public.friends_state() to authenticated;

create or replace function public.send_friend_request(p_addressee uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_addressee = v_uid then raise exception 'cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_addressee) then
    raise exception 'profile not found';
  end if;

  -- Already friends: keep the accepted row instead of reopening a request.
  select id into v_id
  from public.friendships
  where status = 'accepted'
    and ((requester = v_uid and addressee = p_addressee)
      or (requester = p_addressee and addressee = v_uid));
  if v_id is not null then return v_id; end if;

  select id into v_id
  from public.friendships
  where status = 'pending' and requester = p_addressee and addressee = v_uid;

  if v_id is not null then
    update public.friendships
    set status = 'accepted', updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.friendships (requester, addressee, status)
  values (v_uid, p_addressee, 'pending')
  on conflict (requester, addressee)
  do update set status = 'pending', updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = now()
  where id = p_id and addressee = auth.uid() and status = 'pending';
  return found;
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friendship(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
  where id = p_id and auth.uid() in (requester, addressee);
  return found;
end;
$$;

revoke all on function public.remove_friendship(uuid) from public;
grant execute on function public.remove_friendship(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Room invites
-- ---------------------------------------------------------------------------
create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  inviter uuid not null references auth.users (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (room_id, invitee)
);

alter table public.room_invites enable row level security;

drop policy if exists "room_invites_select_related" on public.room_invites;
create policy "room_invites_select_related"
  on public.room_invites for select
  using (
    invitee = auth.uid()
    or inviter = auth.uid()
    or exists (select 1 from public.rooms r where r.id = room_id and r.host = auth.uid())
  );

drop policy if exists "room_invites_insert_host" on public.room_invites;
create policy "room_invites_insert_host"
  on public.room_invites for insert
  with check (
    inviter = auth.uid()
    and exists (select 1 from public.rooms r where r.id = room_id and r.host = auth.uid())
  );

drop policy if exists "room_invites_update_invitee" on public.room_invites;
create policy "room_invites_update_invitee"
  on public.room_invites for update
  using (invitee = auth.uid() or inviter = auth.uid())
  with check (invitee = auth.uid() or inviter = auth.uid());

drop policy if exists "room_invites_delete_related" on public.room_invites;
create policy "room_invites_delete_related"
  on public.room_invites for delete
  using (invitee = auth.uid() or inviter = auth.uid());

-- ---------------------------------------------------------------------------
-- Room RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_room(
  p_name text,
  p_movie_id text,
  p_is_private boolean default false
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_room public.rooms;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  loop
    v_code := 'W00-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms (code, name, host, movie_id, is_private, playback_state)
  values (
    v_code,
    coalesce(nullif(trim(p_name), ''), 'Sala de cinema'),
    v_uid,
    p_movie_id,
    coalesce(p_is_private, false),
    jsonb_build_object('paused', true, 'time', 0, 'at', 0)
  )
  returning * into v_room;

  insert into public.room_members (room_id, user_id)
  values (v_room.id, v_uid)
  on conflict do nothing;

  return v_room;
end;
$$;

revoke all on function public.create_room(text, text, boolean) from public;
grant execute on function public.create_room(text, text, boolean) to authenticated;

create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_invite public.room_invites;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code));

  if v_room.id is null then raise exception 'room not found'; end if;

  -- A member can always re-enter their room, including private rooms.
  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and user_id = v_uid
  ) then
    return v_room;
  end if;

  if v_room.is_private and v_room.host <> v_uid then
    -- Accept both pending and already-accepted invites. An accepted invite can
    -- outlive the room_members row when the guest leaves and comes back; the
    -- old pending-only check made the invite look missing.
    select * into v_invite
    from public.room_invites
    where room_id = v_room.id
      and invitee = v_uid
      and status in ('pending', 'accepted');
    if v_invite.id is null then raise exception 'invite required'; end if;
    update public.room_invites
    set status = 'accepted'
    where id = v_invite.id;
  end if;

  insert into public.room_members (room_id, user_id)
  values (v_room.id, v_uid)
  on conflict do nothing;

  return v_room;
end;
$$;

revoke all on function public.join_room(text) from public;
grant execute on function public.join_room(text) to authenticated;

create or replace function public.leave_room(p_room uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  select host into v_host from public.rooms where id = p_room;
  if v_host is null then return false; end if;

  if v_host = v_uid then
    delete from public.rooms where id = p_room;
  else
    delete from public.room_members where room_id = p_room and user_id = v_uid;
    -- A guest leaving the last seat closes the room as well.
    delete from public.rooms r
    where r.id = p_room
      and not exists (
        select 1 from public.room_members m where m.room_id = p_room
      );
  end if;
  return true;
end;
$$;

revoke all on function public.leave_room(uuid) from public;
grant execute on function public.leave_room(uuid) to authenticated;

create or replace function public.list_rooms()
returns table (
  id uuid,
  code text,
  name text,
  host_id uuid,
  host_name text,
  host_avatar text,
  movie_id text,
  is_private boolean,
  created_at timestamptz,
  member_count bigint,
  is_member boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.code,
    r.name,
    r.host,
    p.name,
    p.avatar_url,
    r.movie_id,
    r.is_private,
    r.created_at,
    (select count(*) from public.room_members m where m.room_id = r.id),
    exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = auth.uid())
  from public.rooms r
  join public.profiles p on p.id = r.host
  where r.is_private = false
  order by r.created_at desc
  limit 50;
$$;

revoke all on function public.list_rooms() from public;
grant execute on function public.list_rooms() to authenticated;

create or replace function public.room_members_view(p_room uuid)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  joined_at timestamptz,
  is_host boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    p.name,
    p.avatar_url,
    m.joined_at,
    (r.host = m.user_id)
  from public.room_members m
  join public.profiles p on p.id = m.user_id
  join public.rooms r on r.id = m.room_id
  where m.room_id = p_room
    and exists (
      select 1 from public.room_members me
      where me.room_id = p_room and me.user_id = auth.uid()
    )
  order by (r.host = m.user_id) desc, m.joined_at;
$$;

revoke all on function public.room_members_view(uuid) from public;
grant execute on function public.room_members_view(uuid) to authenticated;

create or replace function public.my_room_invites()
returns table (
  id uuid,
  room_id uuid,
  room_code text,
  room_name text,
  host_id uuid,
  host_name text,
  host_avatar text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    r.id,
    r.code,
    r.name,
    r.host,
    p.name,
    p.avatar_url,
    i.created_at
  from public.room_invites i
  join public.rooms r on r.id = i.room_id
  join public.profiles p on p.id = r.host
  where i.invitee = auth.uid() and i.status = 'pending'
  order by i.created_at desc;
$$;

revoke all on function public.my_room_invites() from public;
grant execute on function public.my_room_invites() to authenticated;

create or replace function public.invite_friend_to_room(p_room uuid, p_friend uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.rooms where id = p_room and host = v_uid) then
    raise exception 'only the host can invite';
  end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = v_uid and addressee = p_friend) or (requester = p_friend and addressee = v_uid))
  ) then
    raise exception 'not friends';
  end if;
  if exists (select 1 from public.room_members where room_id = p_room and user_id = p_friend) then
    return null;
  end if;

  insert into public.room_invites (room_id, inviter, invitee, status)
  values (p_room, v_uid, p_friend, 'pending')
  on conflict (room_id, invitee)
  do update set status = 'pending', inviter = v_uid, created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.invite_friend_to_room(uuid, uuid) from public;
grant execute on function public.invite_friend_to_room(uuid, uuid) to authenticated;

create or replace function public.respond_room_invite(p_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  update public.room_invites
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_id
    and invitee = auth.uid()
    and (status = 'pending' or (p_accept and status = 'accepted'))
  returning room_id into v_room;

  if v_room is not null and p_accept then
    insert into public.room_members (room_id, user_id)
    values (v_room, auth.uid())
    on conflict do nothing;
  end if;

  return v_room;
end;
$$;

revoke all on function public.respond_room_invite(uuid, boolean) from public;
grant execute on function public.respond_room_invite(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.room_invites;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

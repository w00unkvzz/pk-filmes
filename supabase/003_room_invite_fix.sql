-- w00filmes — private room invite fix
-- Run after 002_social.sql. Safe to re-run.
--
-- Problem: join_room() only accepted invites with status = 'pending'. Once a
-- guest accepted an invite and later left the room (or the room was reopened),
-- the invite stayed 'accepted' while room_members no longer had the guest, so
-- joining again raised "invite required" even though the invite existed.
--
-- Fix: join_room() accepts both 'pending' and 'accepted' invites, and
-- respond_room_invite() is idempotent when accepting an already-accepted invite.

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

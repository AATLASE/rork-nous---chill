-- Lot 5: two invite codes per space, one per role (review UX-3).
--
-- Until now a space had a single code and everybody joined as an observer, then
-- waited for the owner to promote them before they could do anything. The owner
-- now shares one of two codes:
--   - observer: sees the episodes, photos and revealed reviews;
--   - member:   participates (creates episodes, writes reviews). Participants
--               count for the reveal, so this code is visible to the owner only.
-- Existing codes are observer codes and keep working unchanged.

-- One code per (space, role) instead of one per space.
drop index if exists public.invite_codes_space_id_key;
create unique index if not exists invite_codes_space_role_key on public.invite_codes (space_id, role);

-- Every existing space gets its participant code. Same alphabet as the app
-- (lib/invites.ts): no 0/O or 1/I, so codes stay easy to dictate.
create or replace function public.random_invite_code(p_length int default 7) returns text
  language sql volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_length);
$$;

insert into public.invite_codes (code, space_id, role, created_by)
select public.random_invite_code(), s.id, 'member', s.created_by
from public.spaces s
where not exists (select 1 from public.invite_codes c where c.space_id = s.id and c.role = 'member')
on conflict do nothing;

-- The participant code is the owner's to hand out; members keep seeing the
-- observer code (some spaces let members share it).
drop policy if exists "invite_codes_select_member" on public.invite_codes;
create policy "invite_codes_select_member" on public.invite_codes
  for select to authenticated
  using (
    public.my_space_role(space_id) = 'owner'
    or (role = 'observer' and public.my_space_role(space_id) is not null)
  );

-- Joining now takes the role of the code. The return type gains `role`, so the
-- function is dropped and recreated (and its grant restored).
drop function if exists public.join_space_with_code(text);

create function public.join_space_with_code(p_code text)
  returns table (space_id uuid, already_member boolean, role text)
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite_id uuid;
  v_space_id uuid;
  v_code_role text;
  v_current_role text;
begin
  if v_user is null then
    raise exception 'Connecte-toi pour rejoindre un espace.';
  end if;

  -- Codes are stored uppercase, but be forgiving about what was typed or pasted.
  select c.id, c.space_id, c.role
    into v_invite_id, v_space_id, v_code_role
  from public.invite_codes c
  where upper(c.code) = upper(btrim(p_code))
  limit 1;

  if v_space_id is null then
    raise exception 'Code invalide. Vérifie-le auprès du propriétaire de l''espace.';
  end if;

  select m.role into v_current_role
  from public.space_members m
  where m.space_id = v_space_id and m.user_id = v_user;

  if v_current_role is not null then
    -- An observer who receives the participant code is promoted; nobody is
    -- ever demoted by a code, and the owner stays the owner.
    if v_code_role = 'member' and v_current_role = 'observer' then
      update public.space_members m
      set role = 'member', can_create_episodes = true
      where m.space_id = v_space_id and m.user_id = v_user;
      return query select v_space_id, true, 'member'::text;
      return;
    end if;
    return query select v_space_id, true, v_current_role;
    return;
  end if;

  insert into public.space_members (space_id, user_id, role, can_create_episodes)
  values (v_space_id, v_user, v_code_role, v_code_role = 'member');

  update public.invite_codes
  set use_count = coalesce(use_count, 0) + 1
  where id = v_invite_id;

  return query select v_space_id, false, v_code_role;
end;
$$;

grant execute on function public.join_space_with_code(text) to authenticated;

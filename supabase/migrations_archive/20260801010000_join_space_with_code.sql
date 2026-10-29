-- Redeeming a space code
--
-- Symptom: a perfectly valid code is rejected with "Code d'invitation invalide".
-- The client looks the code up in `invite_codes`, but the RLS policy on that table
-- only exposes a row to people who are already members of the space — so the one
-- person who needs to read it, the newcomer, gets zero rows back and the app can
-- only conclude the code does not exist.
--
-- The tempting fix (a `select ... using (true)` policy for authenticated users)
-- would also let any signed-in account list every code in the database and walk
-- into every space. So redemption happens inside a SECURITY DEFINER function
-- instead: it runs with the definer's rights, never reveals more than the space a
-- submitted code points to, and performs the membership insert itself. RLS on
-- `invite_codes` stays closed.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

create or replace function public.join_space_with_code(p_code text)
returns table (space_id uuid, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite_id uuid;
  v_space_id uuid;
begin
  if v_user is null then
    raise exception 'Connecte-toi pour rejoindre un espace.';
  end if;

  -- Codes are stored uppercase, but be forgiving about what was typed or pasted.
  select c.id, c.space_id
    into v_invite_id, v_space_id
  from public.invite_codes c
  where upper(c.code) = upper(btrim(p_code))
  limit 1;

  if v_space_id is null then
    raise exception 'Code invalide. Vérifie-le auprès du propriétaire de l''espace.';
  end if;

  if exists (
    select 1 from public.space_members m
    where m.space_id = v_space_id and m.user_id = v_user
  ) then
    return query select v_space_id, true;
    return;
  end if;

  -- Everyone enters as an observer; the owner promotes participants afterwards.
  insert into public.space_members (space_id, user_id, role, can_create_episodes)
  values (v_space_id, v_user, 'observer', false);

  update public.invite_codes
  set use_count = coalesce(use_count, 0) + 1
  where id = v_invite_id;

  return query select v_space_id, false;
end;
$$;

-- Only signed-in accounts may redeem (the function also checks auth.uid()).
revoke all on function public.join_space_with_code(text) from public;
grant execute on function public.join_space_with_code(text) to authenticated;

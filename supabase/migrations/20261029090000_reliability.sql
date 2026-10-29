-- Lot 6: reliability fixes on the database side.
--
-- 1. Episode numbers are assigned here (BUG-12). The app computed MAX+1 itself,
--    so two people creating an episode at the same time got the same number
--    and the second one failed on the unique (space_id, number) constraint.
-- 2. The reveal check reruns only when a role changes (DATA-13): it ran on
--    every update of space_members, whatever the column.
-- 3. Leaving a space (or being removed) clears that person's notifications for
--    it (DATA-10): they kept pointing at a space they could no longer open.
-- 4. The season summary is readable once the season is unlocked, or by the
--    owner (SEC-6): every member could read it while the recap was sealed.
-- 5. reveal_episode_now: the owner can reveal one episode without waiting for
--    a participant who will never write (UX-7). Automatic reminders already
--    exist (send_review_reminders).

-- 1. Episode numbers -------------------------------------------------------

create or replace function public.episodes_assign_number() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
begin
  -- One creation at a time per space, for the length of the transaction.
  perform pg_advisory_xact_lock(hashtext('episodes_number:' || new.space_id::text));
  select coalesce(max(e.number), 0) + 1 into new.number
  from public.episodes e
  where e.space_id = new.space_id;
  return new;
end $$;

drop trigger if exists episodes_assign_number on public.episodes;
create trigger episodes_assign_number
  before insert on public.episodes
  for each row execute function public.episodes_assign_number();

-- 2. Reveal rerun only on role changes -------------------------------------

drop trigger if exists space_members_reveal_episodes on public.space_members;
create trigger space_members_reveal_episodes
  after delete or update of role, can_create_episodes on public.space_members
  for each row execute function public.space_members_after_change_reveal();

-- 3. Notifications follow membership ----------------------------------------

create or replace function public.space_members_after_delete_forget_notifications() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
begin
  delete from public.notifications n
  where n.user_id = old.user_id and n.space_id = old.space_id;
  return null;
end $$;

drop trigger if exists space_members_forget_notifications on public.space_members;
create trigger space_members_forget_notifications
  after delete on public.space_members
  for each row execute function public.space_members_after_delete_forget_notifications();

-- 4. Season summary sealed until unlocked -------------------------------------

drop policy if exists "synthese_select_member" on public.synthese;
create policy "synthese_select_member" on public.synthese
  for select to authenticated
  using (
    public.my_space_role(space_id) = 'owner'
    or (
      public.my_space_role(space_id) is not null
      and exists (select 1 from public.spaces s where s.id = synthese.space_id and s.season_unlocked)
    )
  );

-- 5. Owner reveals one episode ------------------------------------------------

create or replace function public.reveal_episode_now(p_episode_id uuid) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_space uuid;
begin
  select e.space_id into v_space from public.episodes e where e.id = p_episode_id;
  if v_space is null then
    raise exception 'Épisode introuvable.' using errcode = 'P0002';
  end if;
  if not public.is_space_owner(v_space) then
    raise exception 'Seul le propriétaire de l''espace peut révéler un épisode.' using errcode = '42501';
  end if;

  -- Same stamp the automatic reveal writes; the reveal notification follows
  -- from the episodes_notify_reveal trigger.
  update public.episodes
  set reviews_revealed_at = now()
  where id = p_episode_id and reviews_revealed_at is null;
end $$;

grant execute on function public.reveal_episode_now(uuid) to authenticated;

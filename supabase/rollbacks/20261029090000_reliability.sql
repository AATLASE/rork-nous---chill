-- Rollback of 20261029090000_reliability.sql
drop trigger if exists episodes_assign_number on public.episodes;
drop function if exists public.episodes_assign_number();
drop trigger if exists space_members_reveal_episodes on public.space_members;
create trigger space_members_reveal_episodes after delete or update on public.space_members
  for each row execute function public.space_members_after_change_reveal();
drop trigger if exists space_members_forget_notifications on public.space_members;
drop function if exists public.space_members_after_delete_forget_notifications();
drop policy if exists "synthese_select_member" on public.synthese;
create policy "synthese_select_member" on public.synthese for select to authenticated
  using (public.my_space_role(space_id) is not null);
drop function if exists public.reveal_episode_now(uuid);

-- Rollback of 20261029080000_two_invite_codes.sql
-- Participant codes are deleted; people who joined with one keep their role.
delete from public.invite_codes where role = 'member';
drop index if exists public.invite_codes_space_role_key;
create unique index if not exists invite_codes_space_id_key on public.invite_codes (space_id);
drop policy if exists "invite_codes_select_member" on public.invite_codes;
create policy "invite_codes_select_member" on public.invite_codes for select to authenticated
  using (public.my_space_role(space_id) is not null);
drop function if exists public.join_space_with_code(text);
-- Then re-run the join_space_with_code definition from 20261029013924_remote_schema.sql
-- and: grant execute on function public.join_space_with_code(text) to authenticated;
drop function if exists public.random_invite_code(int);

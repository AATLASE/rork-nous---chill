-- Deleting an episode, or one of its photos
--
-- The app had no delete for either: comments, ideas, members and spaces could
-- be removed, episodes and their media could not. The buttons now exist, so the
-- database has to allow the operation — and there are two ways it can silently
-- refuse.
--
-- 1. Missing RLS policy. A delete nobody is allowed to perform does not raise:
--    the rows are simply filtered out and Postgres reports success with zero
--    rows touched. The app guards against that by asking for the deleted ids
--    back, but the rule itself has to exist. Owning the space, or having
--    written the episode, is what grants it.
--
-- 2. Foreign keys without ON DELETE CASCADE. Deleting an episode that still has
--    media, comments, likes or reviews attached fails on the constraint. The
--    block below promotes those keys to CASCADE, which also lets the delete
--    clean up children the caller has no policy to remove by hand.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- Same SECURITY DEFINER reasoning as owns_space_media_path: the check reads
-- space_members, which is behind RLS, and answers a question about the caller
-- alone.
create or replace function public.is_space_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_space_owner(uuid) from public;
grant execute on function public.is_space_owner(uuid) to authenticated;

drop policy if exists "episodes: author or space owner deletes" on public.episodes;
create policy "episodes: author or space owner deletes"
on public.episodes for delete
to authenticated
using (created_by = auth.uid() or public.is_space_owner(space_id));

-- Media: whoever added it, or the owner of the space it belongs to.
drop policy if exists "episode media: uploader or space owner deletes" on public.episode_media;
create policy "episode media: uploader or space owner deletes"
on public.episode_media for delete
to authenticated
using (uploaded_by = auth.uid() or public.is_space_owner(space_id));

-- Everything pointing at an episode follows it into the grave. Only keys left
-- at the default NO ACTION are touched: an explicit ON DELETE rule elsewhere is
-- a deliberate choice and stays as it is.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname,
           con.conrelid::regclass::text as child_table,
           pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refns on refns.oid = ref.relnamespace
    where con.contype = 'f'
      and refns.nspname = 'public'
      and ref.relname = 'episodes'
      and con.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', fk.child_table, fk.conname);
    execute format('alter table %s add constraint %I %s on delete cascade',
                   fk.child_table, fk.conname, fk.definition);
    raise notice 'cascade activé sur %.%', fk.child_table, fk.conname;
  end loop;
end $$;

commit;

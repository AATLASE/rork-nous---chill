-- Observers comment once the group has published its reviews
--
-- An observer sees an episode, likes it and reacts to comments, but writing a
-- comment was reserved to participants. The rule becomes a matter of timing
-- rather than of role: as long as reviews are still being written, an outside
-- comment lands on a moment its own participants have not finished describing —
-- and can colour what they are about to write. Once the episode is revealed
-- (everybody published, or the owner unlocked the season), that risk is gone and
-- the conversation opens to the whole space.
--
-- The screen already hides the composer, but a hidden control is not a rule: the
-- table has to refuse the insert too, otherwise the API happily accepts it.
--
-- What this file rewrites: every policy on `episode_comments`. Permissive
-- policies are OR-ed together, so a leftover "any member inserts" rule would
-- keep the door open no matter what is added here — the whole set is replaced
-- rather than guessed at. Reading, editing and deleting keep the behaviour the
-- app has always assumed: members of the space read, authors edit their own,
-- authors and the space owner delete.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Repeated verbatim from 20260801040000_reveal_reviews_when_everyone_answered.sql
-- so this file can be pasted on its own. Same SECURITY DEFINER reasoning: they
-- read `episodes`, `spaces` and `space_members`, all behind RLS, and answer a
-- question about the caller alone.

create or replace function public.episode_space_id(p_episode_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.space_id from public.episodes e where e.id = p_episode_id;
$$;

create or replace function public.is_space_member(p_space_id uuid)
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
  );
$$;

create or replace function public.can_review_in_space(p_space_id uuid)
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
      and (m.role = 'owner' or (m.role = 'member' and coalesce(m.can_create_episodes, false)))
  );
$$;

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

-- The gate itself, and the only new function here: an episode is open to
-- everyone once its reviews are out. Deliberately the same condition as
-- episode_reviews_visible minus the membership test — this one answers "is this
-- episode still sealed", not "may I read it".
create or replace function public.episode_is_revealed(p_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.episodes e
    join public.spaces s on s.id = e.space_id
    where e.id = p_episode_id
      and (e.reviews_revealed_at is not null or s.season_unlocked)
  );
$$;

revoke all on function public.episode_space_id(uuid) from public;
revoke all on function public.is_space_member(uuid) from public;
revoke all on function public.can_review_in_space(uuid) from public;
revoke all on function public.is_space_owner(uuid) from public;
revoke all on function public.episode_is_revealed(uuid) from public;
grant execute on function public.episode_space_id(uuid) to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.can_review_in_space(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;
grant execute on function public.episode_is_revealed(uuid) to authenticated;

-- ── Row level security on episode_comments ─────────────────────────────────

alter table public.episode_comments enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, cmd
    from pg_policies
    where schemaname = 'public' and tablename = 'episode_comments'
  loop
    execute format('drop policy %I on public.episode_comments', pol.policyname);
    raise notice 'ancienne policy % (%) supprimée sur episode_comments', pol.policyname, pol.cmd;
  end loop;
end $$;

-- Comments were never part of the seal: the whole space reads them, observers
-- included.
create policy "episode comments: members of the space read"
on public.episode_comments for select
to authenticated
using (public.is_space_member(public.episode_space_id(episode_id)));

-- Participants write whenever they want — they are the ones the episode is
-- about. Everyone else in the space writes once the episode is revealed.
create policy "episode comments: participants always, the space once revealed"
on public.episode_comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.is_space_member(public.episode_space_id(episode_id))
  and (
    public.can_review_in_space(public.episode_space_id(episode_id))
    or public.episode_is_revealed(episode_id)
  )
);

create policy "episode comments: authors edit their own"
on public.episode_comments for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- Moderation stays with the space owner; everyone else only removes their own.
create policy "episode comments: author or space owner deletes"
on public.episode_comments for delete
to authenticated
using (
  author_id = auth.uid()
  or public.is_space_owner(public.episode_space_id(episode_id))
);

commit;

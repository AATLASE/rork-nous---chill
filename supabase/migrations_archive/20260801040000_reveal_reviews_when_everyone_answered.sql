-- Reviews reveal themselves when everyone has written one
--
-- Until now the reveal was the end of the *season*: the owner pressed "Débloquer
-- la saison" and every review of every episode surfaced at once. The rule
-- becomes per-episode instead — the last participant to publish opens that
-- episode for the whole group. The season switch stays as a fallback for
-- episodes somebody never answered.
--
-- Two things have to change, and the second one is the reason this file is not
-- optional.
--
-- 1. When to reveal. `episodes.reviews_revealed_at` records the moment the last
--    participant published. It is stamped by a trigger, never by the client, and
--    once set it stays set: promoting a new member afterwards must not re-seal an
--    episode the group has already read together.
--
-- 2. Who can read what. The seal was enforced by the screen, not by the
--    database: the episode screen simply did not render other people's reviews
--    before the unlock. Anyone could read them straight from the API. Since the
--    whole feature is a promise of privacy, the rules below make `reviews`
--    answer that promise — select is limited to your own review until the
--    episode is revealed. The app then needs another way to display "qui a déjà
--    répondu" without the content, hence `episode_review_authors`.
--
-- Participants are the people the app asks for a review: the owner, and members
-- allowed to create episodes. Observers never block a reveal.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

alter table public.episodes
  add column if not exists reviews_revealed_at timestamptz;

comment on column public.episodes.reviews_revealed_at is
  'Set once every participant of the space has published a review for this episode. Never cleared.';

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Same SECURITY DEFINER reasoning as owns_space_media_path: they read
-- `space_members` and `episodes`, both behind RLS, and answer a question about
-- the caller alone.

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

-- Writing a review is for participants only — the same test the app uses to
-- decide whether to show the form (see canParticipate in lib/types.ts).
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

-- Repeated verbatim from 20260801030000_delete_episodes_and_media.sql so this
-- file can be pasted on its own.
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

revoke all on function public.episode_space_id(uuid) from public;
revoke all on function public.is_space_member(uuid) from public;
revoke all on function public.can_review_in_space(uuid) from public;
revoke all on function public.is_space_owner(uuid) from public;
grant execute on function public.episode_space_id(uuid) to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.can_review_in_space(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;

-- ── The reveal ─────────────────────────────────────────────────────────────

-- Stamps the episode when nobody is missing. Callable by anyone: it grants
-- nothing on its own, it only checks a condition the caller cannot fake.
create or replace function public.reveal_episode_reviews_if_complete(p_episode_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  -- Nothing to do for an unknown episode, or one already revealed: the stamp is
  -- written once and never moves.
  select e.space_id into v_space
  from public.episodes e
  where e.id = p_episode_id and e.reviews_revealed_at is null;
  if v_space is null then
    return;
  end if;

  -- A space with no participants at all would otherwise "complete" with zero
  -- reviews and reveal an empty episode.
  if not exists (select 1 from public.reviews r where r.episode_id = p_episode_id) then
    return;
  end if;

  if exists (
    select 1
    from public.space_members m
    where m.space_id = v_space
      and (m.role = 'owner' or (m.role = 'member' and coalesce(m.can_create_episodes, false)))
      and not exists (
        select 1
        from public.reviews r
        where r.episode_id = p_episode_id
          and r.author_id = m.user_id
      )
  ) then
    return; -- somebody still has to write
  end if;

  update public.episodes
  set reviews_revealed_at = now()
  where id = p_episode_id and reviews_revealed_at is null;
end $$;

grant execute on function public.reveal_episode_reviews_if_complete(uuid) to authenticated;

-- The last review to land opens the episode.
create or replace function public.reviews_after_insert_reveal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reveal_episode_reviews_if_complete(new.episode_id);
  return null;
end $$;

drop trigger if exists reviews_reveal_episode on public.reviews;
create trigger reviews_reveal_episode
after insert on public.reviews
for each row
execute function public.reviews_after_insert_reveal();

-- The group can also shrink into completeness: demoting a member to observer,
-- or removing them, can leave an episode with nobody left to wait for.
create or replace function public.space_members_after_change_reveal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  ep record;
begin
  -- Branch rather than coalesce: NEW does not exist on a delete, and reading it
  -- there is an error in itself.
  if tg_op = 'DELETE' then
    v_space := old.space_id;
  else
    v_space := new.space_id;
  end if;

  for ep in
    select e.id
    from public.episodes e
    where e.space_id = v_space and e.reviews_revealed_at is null
  loop
    perform public.reveal_episode_reviews_if_complete(ep.id);
  end loop;
  return null;
end $$;

drop trigger if exists space_members_reveal_episodes on public.space_members;
create trigger space_members_reveal_episodes
after update or delete on public.space_members
for each row
execute function public.space_members_after_change_reveal();

-- ── Reading reviews ────────────────────────────────────────────────────────

create or replace function public.episode_reviews_visible(p_episode_id uuid)
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
    join public.space_members m on m.space_id = e.space_id and m.user_id = auth.uid()
    where e.id = p_episode_id
      and (e.reviews_revealed_at is not null or s.season_unlocked)
  );
$$;

-- Before the reveal the app still has to show who has answered and who is
-- holding everyone up. That list is names, never content, so it goes through a
-- function instead of a wider read on the table.
create or replace function public.episode_review_authors(p_episode_id uuid)
returns table (author_id uuid, submitted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.author_id, r.created_at
  from public.reviews r
  join public.episodes e on e.id = r.episode_id
  where r.episode_id = p_episode_id
    and exists (
      select 1
      from public.space_members m
      where m.space_id = e.space_id
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.episode_reviews_visible(uuid) from public;
revoke all on function public.episode_review_authors(uuid) from public;
grant execute on function public.episode_reviews_visible(uuid) to authenticated;
grant execute on function public.episode_review_authors(uuid) to authenticated;

-- ── Row level security on reviews ──────────────────────────────────────────

alter table public.reviews enable row level security;

-- Permissive policies are OR-ed together, so a single leftover "members read
-- this space's reviews" rule would keep the table wide open. Every SELECT
-- policy is dropped and replaced by the one below rather than assuming what is
-- currently there. Write policies are (re)created for the same reason: enabling
-- RLS on a table that had none would otherwise refuse every insert.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, cmd
    from pg_policies
    where schemaname = 'public' and tablename = 'reviews'
  loop
    execute format('drop policy %I on public.reviews', pol.policyname);
    raise notice 'ancienne policy % (%) supprimée sur reviews', pol.policyname, pol.cmd;
  end loop;
end $$;

-- Your own review, always. Everyone else's, once the episode is revealed —
-- either because the group completed it, or because the owner unlocked the
-- season.
create policy "reviews: mine, or the whole episode once revealed"
on public.reviews for select
to authenticated
using (author_id = auth.uid() or public.episode_reviews_visible(episode_id));

create policy "reviews: participants write their own"
on public.reviews for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_review_in_space(public.episode_space_id(episode_id))
);

-- Editing stays open after the reveal: a typo is still worth fixing, and the
-- row is already public to the space by then.
create policy "reviews: authors edit their own"
on public.reviews for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "reviews: author or space owner deletes"
on public.reviews for delete
to authenticated
using (
  author_id = auth.uid()
  or public.is_space_owner(public.episode_space_id(episode_id))
);

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Episodes where everyone had already answered under the old rule are revealed
-- now, which is exactly what the new rule says about them.
do $$
declare
  ep record;
  n_before int;
  n_after int;
begin
  select count(*) into n_before from public.episodes where reviews_revealed_at is not null;
  for ep in select id from public.episodes where reviews_revealed_at is null loop
    perform public.reveal_episode_reviews_if_complete(ep.id);
  end loop;
  select count(*) into n_after from public.episodes where reviews_revealed_at is not null;
  raise notice '% épisode(s) révélé(s) par le rattrapage', n_after - n_before;
end $$;

commit;

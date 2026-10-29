-- Lot 3: protect the data the reveal mechanic depends on (review SEC-2, SEC-4, DATA-5).
--
-- 1. A comment or a review can be edited, but never moved. The UPDATE policies
--    only check author_id = auth.uid(), so an author could PATCH episode_id and
--    land a comment on an episode the INSERT policy would have refused (e.g. an
--    observer commenting on a sealed episode), or move a review elsewhere.
-- 2. reviews.space_id came from the client unchecked; it is now derived from the
--    episode, like episode_comments.space_id already is.
-- 3. reviews_revealed_at is only ever written by the database (the reveal
--    function). The episodes UPDATE policy lets the space owner write any
--    column, so a client could stamp an episode as revealed before everyone
--    answered.
-- 4. Two last reviews arriving at the same time could both see the other one as
--    missing (each transaction only sees its own row), and the episode never
--    revealed. The reveal now locks the episode row first, so the second
--    transaction waits for the first and sees its review.

-- 1. Frozen keys -----------------------------------------------------------

create or replace function public.episode_comments_freeze_keys() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if new.episode_id is distinct from old.episode_id
     or new.author_id is distinct from old.author_id
     or new.space_id is distinct from old.space_id
     or new.parent_id is distinct from old.parent_id then
    raise exception 'Un commentaire ne peut pas changer d''épisode, d''auteur ni de fil.'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- Named to sort before episode_comments_set_space_id: triggers of the same
-- timing fire in name order, so the move is refused before anything else runs.
drop trigger if exists episode_comments_freeze_keys on public.episode_comments;
create trigger episode_comments_freeze_keys
  before update on public.episode_comments
  for each row execute function public.episode_comments_freeze_keys();

create or replace function public.reviews_freeze_keys() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if new.episode_id is distinct from old.episode_id
     or new.author_id is distinct from old.author_id
     or new.space_id is distinct from old.space_id then
    raise exception 'Une review ne peut pas changer d''épisode ni d''auteur.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists reviews_freeze_keys on public.reviews;
create trigger reviews_freeze_keys
  before update on public.reviews
  for each row execute function public.reviews_freeze_keys();

-- 2. reviews.space_id follows the episode ----------------------------------

create or replace function public.reviews_fill_space_id() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_space uuid;
begin
  select e.space_id into v_space from public.episodes e where e.id = new.episode_id;
  -- Unknown episode: leave it to the foreign key to refuse the row.
  if v_space is not null then
    new.space_id := v_space;
  end if;
  return new;
end $$;

drop trigger if exists reviews_fill_space_id on public.reviews;
create trigger reviews_fill_space_id
  before insert on public.reviews
  for each row execute function public.reviews_fill_space_id();

-- Existing rows: same rule, in case any was written with a wrong space.
update public.reviews r
set space_id = e.space_id
from public.episodes e
where e.id = r.episode_id and r.space_id is distinct from e.space_id;

-- 3. Only the database stamps a reveal -------------------------------------

-- SECURITY INVOKER on purpose: current_user is then the role of whoever wrote
-- the row. The reveal function is SECURITY DEFINER, so its update runs as the
-- function owner and goes through.
create or replace function public.episodes_keep_reveal_stamp() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if new.reviews_revealed_at is distinct from old.reviews_revealed_at
     and current_user in ('anon', 'authenticated') then
    new.reviews_revealed_at := old.reviews_revealed_at;
  end if;
  return new;
end $$;

drop trigger if exists episodes_keep_reveal_stamp on public.episodes;
create trigger episodes_keep_reveal_stamp
  before update on public.episodes
  for each row execute function public.episodes_keep_reveal_stamp();

-- 4. Reveal serialised per episode -----------------------------------------

create or replace function public.reveal_episode_reviews_if_complete(p_episode_id uuid) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_space uuid;
begin
  -- Locking the row makes concurrent last reviews take turns: the second one
  -- waits here, then its next statements see the first one's committed review.
  -- Nothing to do for an unknown episode, or one already revealed: the stamp is
  -- written once and never moves.
  select e.space_id into v_space
  from public.episodes e
  where e.id = p_episode_id and e.reviews_revealed_at is null
  for update;
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

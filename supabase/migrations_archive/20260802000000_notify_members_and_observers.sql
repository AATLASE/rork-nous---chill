-- The bell rings: episodes, reviews, comments and reveals write notifications
--
-- The app has had a notification screen, an unread badge on the header and a
-- table of push tokens since the beginning — and nothing, anywhere, has ever
-- inserted a row into `notifications`. The bell was wired to a door nobody
-- knocks on. This file is the missing half: the database itself records what
-- happened, for the people it happened to.
--
-- Who hears what, and why:
--
--   • a new episode       → the participants of the space, except its author.
--   • a review published  → the other participants. Only on the first publish:
--                           a review is upserted by the app, and fixing a typo
--                           an hour later is not news.
--   • a comment           → the participants, except its author.
--   • an episode revealed → the observers. This is the one moment the episode
--                           becomes theirs to read, and the wording says so.
--
-- Observers are deliberately silent on the first three. An episode whose reviews
-- are still being written is not readable by them yet, so announcing it would
-- only be an invitation to wait; and a comment thread they cannot join before
-- the reveal is not something to interrupt them for. They get one notification
-- per episode, at the moment it is worth opening.
--
-- Nothing here can break what the user was doing. Every insert goes through
-- `notify_user`, which catches its own errors: a notification is a courtesy, and
-- a courtesy that fails must never roll back the episode somebody just created.
--
-- Scope note: this file fills the in-app list. Turning those rows into a phone
-- that buzzes needs a sender (an Edge Function reading `push_subscriptions` and
-- calling the Expo Push API) — the rows land here either way.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- ── The table ──────────────────────────────────────────────────────────────
-- Created rather than assumed: the app reads this table, but a missing table
-- reads as "no notifications" through the client, so its absence would be
-- invisible until now.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid,
  title text,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists space_id uuid;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists url text;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

-- The list is read newest-first per user, and the badge counts the unread ones.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- If the table already existed with a mandatory column this file knows nothing
-- about, every insert below would fail — silently, since notify_user swallows
-- its errors. Say so now, while somebody is reading the output.
do $$
declare
  col record;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and is_nullable = 'NO'
      and column_default is null
      and column_name not in ('id', 'user_id', 'space_id', 'title', 'body', 'url', 'read_at', 'created_at')
  loop
    raise notice 'ATTENTION : colonne "%" obligatoire et sans valeur par défaut sur notifications — aucune notification ne pourra être écrite tant qu''elle n''en a pas une', col.column_name;
  end loop;
end $$;

-- ── Row level security ─────────────────────────────────────────────────────
-- Your own notifications, and nothing else. No insert policy on purpose: rows
-- are written by the triggers below, which run as the table owner — a client
-- must not be able to forge a notification in somebody else's list.

alter table public.notifications enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, cmd
    from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy %I on public.notifications', pol.policyname);
    raise notice 'ancienne policy % (%) supprimée sur notifications', pol.policyname, pol.cmd;
  end loop;
end $$;

create policy "notifications: read your own"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

-- The app marks rows read, one by one and all at once.
create policy "notifications: mark your own read"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "notifications: clear your own"
on public.notifications for delete
to authenticated
using (user_id = auth.uid());

-- Explicit rather than left to Supabase's default privileges: a policy grants
-- nothing on its own, and a table created by this file would otherwise be
-- unreadable if those defaults ever change.
grant select, update, delete on public.notifications to authenticated;

-- ── Writing one ────────────────────────────────────────────────────────────

/*
 * The single door every trigger below goes through.
 *
 * SECURITY DEFINER so it can write into a table no client may insert into, and
 * exception-swallowing so that a notification failure — an unknown column, a
 * deleted user, anything — never takes down the transaction that caused it.
 * The user finished writing an episode; they should keep it.
 */
create or replace function public.notify_user(
  p_user_id uuid,
  p_space_id uuid,
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, space_id, title, body, url)
  values (p_user_id, p_space_id, p_title, p_body, p_url);
exception
  when others then
    raise notice 'notification non enregistrée pour % : %', p_user_id, sqlerrm;
end $$;

/** The name to put in "X a publié sa review", with a fallback for a profile that has none. */
create or replace function public.display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(p.name), '') from public.profiles p where p.id = p_user_id),
    'Quelqu''un'
  );
$$;

-- ── Who is who ─────────────────────────────────────────────────────────────
-- The same split the app makes (canParticipate in lib/types.ts) and the reveal
-- rule already depends on: participants write reviews, everybody else in the
-- space watches. `role` is cast to text so this works whether the column is an
-- enum or a plain string, and coalesced so a null role is treated as the least
-- privileged thing it could be rather than disappearing from both lists.

create or replace function public.space_participant_ids(p_space_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.space_members m
  where m.space_id = p_space_id
    and (
      coalesce(m.role::text, 'observer') = 'owner'
      or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
    );
$$;

create or replace function public.space_observer_ids(p_space_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.space_members m
  where m.space_id = p_space_id
    and not (
      coalesce(m.role::text, 'observer') = 'owner'
      or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
    );
$$;

revoke all on function public.notify_user(uuid, uuid, text, text, text) from public;
revoke all on function public.display_name(uuid) from public;
revoke all on function public.space_participant_ids(uuid) from public;
revoke all on function public.space_observer_ids(uuid) from public;

-- ── A new episode ──────────────────────────────────────────────────────────

create or replace function public.episodes_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space text;
  v_author text;
  v_user uuid;
begin
  select s.name into v_space from public.spaces s where s.id = new.space_id;
  v_author := public.display_name(new.created_by);

  for v_user in select public.space_participant_ids(new.space_id) loop
    -- The person who just pressed "Créer" knows.
    if v_user is distinct from new.created_by then
      perform public.notify_user(
        v_user,
        new.space_id,
        format('Nouvel épisode : « %s »', new.title),
        format('%s vient de l''ajouter dans « %s ». À toi d''écrire ta review.', v_author, coalesce(v_space, 'votre aventure')),
        '/episode/' || new.id
      );
    end if;
  end loop;

  return null;
end $$;

drop trigger if exists episodes_notify_new on public.episodes;
create trigger episodes_notify_new
after insert on public.episodes
for each row
execute function public.episodes_after_insert_notify();

-- ── A review lands ─────────────────────────────────────────────────────────

create or replace function public.reviews_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ep record;
  v_author text;
  v_user uuid;
begin
  select e.id, e.title, e.space_id into ep from public.episodes e where e.id = new.episode_id;
  if not found then
    return null;
  end if;

  v_author := public.display_name(new.author_id);

  for v_user in select public.space_participant_ids(ep.space_id) loop
    if v_user is distinct from new.author_id then
      perform public.notify_user(
        v_user,
        ep.space_id,
        format('%s a publié sa review', v_author),
        format('Sur l''épisode « %s ».', ep.title),
        '/episode/' || ep.id
      );
    end if;
  end loop;

  return null;
end $$;

-- Insert only: the app upserts, so an edit is an UPDATE and stays quiet.
drop trigger if exists reviews_notify_published on public.reviews;
create trigger reviews_notify_published
after insert on public.reviews
for each row
execute function public.reviews_after_insert_notify();

-- ── A comment ──────────────────────────────────────────────────────────────

create or replace function public.episode_comments_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ep record;
  v_author text;
  v_excerpt text;
  v_user uuid;
begin
  select e.id, e.title, e.space_id into ep from public.episodes e where e.id = new.episode_id;
  if not found then
    return null;
  end if;

  v_author := public.display_name(new.author_id);
  -- The comment itself, short enough for a notification banner.
  v_excerpt := btrim(coalesce(new.body, ''));
  if length(v_excerpt) > 140 then
    v_excerpt := left(v_excerpt, 139) || '…';
  end if;

  for v_user in select public.space_participant_ids(ep.space_id) loop
    if v_user is distinct from new.author_id then
      perform public.notify_user(
        v_user,
        ep.space_id,
        format('%s a commenté « %s »', v_author, ep.title),
        nullif(v_excerpt, ''),
        '/episode/' || ep.id
      );
    end if;
  end loop;

  return null;
end $$;

drop trigger if exists episode_comments_notify_new on public.episode_comments;
create trigger episode_comments_notify_new
after insert on public.episode_comments
for each row
execute function public.episode_comments_after_insert_notify();

-- ── The reveal, for the people who were waiting for it ─────────────────────
-- Fires on the stamp itself rather than on the last review, so it does not
-- depend on which of the two triggers on `reviews` runs first — and so it also
-- covers the other way an episode completes (a member demoted to observer
-- leaving nobody left to wait for, see 20260801040000).
--
-- Participants are not notified here: the last review to land already told them
-- through the trigger above, and two banners for one event is one too many.

create or replace function public.episodes_after_reveal_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space text;
  v_user uuid;
begin
  select s.name into v_space from public.spaces s where s.id = new.space_id;

  for v_user in select public.space_observer_ids(new.space_id) loop
    perform public.notify_user(
      v_user,
      new.space_id,
      format('Un nouvel épisode de l''aventure « %s » est disponible', coalesce(v_space, 'votre aventure')),
      format('« %s » — les reviews viennent d''être révélées.', new.title),
      '/episode/' || new.id
    );
  end loop;

  return null;
end $$;

drop trigger if exists episodes_notify_reveal on public.episodes;
create trigger episodes_notify_reveal
after update of reviews_revealed_at on public.episodes
for each row
when (old.reviews_revealed_at is null and new.reviews_revealed_at is not null)
execute function public.episodes_after_reveal_notify();

commit;

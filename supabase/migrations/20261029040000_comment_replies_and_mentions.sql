-- Replies and "@" mentions on comments
--
-- Two things a comment could not do until now: answer another comment, and name
-- somebody. Both are one column each, plus the notifications that make them
-- worth having — a reply nobody is told about is a message in a bottle.
--
-- `parent_id` — the comment being answered. Threads are one level deep on
-- purpose: answering an answer hangs the new comment onto the same root rather
-- than indenting forever. The app cannot get this wrong because the database
-- flattens it, whatever the client sends.
--
-- `mentions` — the ids named with "@" in the body. The names stay written in
-- the text (so the comment reads the same everywhere, push banner included) and
-- the ids ride alongside so this file knows who to notify without parsing
-- French. Anyone not in the space is dropped on the way in: a mention is not a
-- channel for reaching strangers.
--
-- Who hears what, when a comment lands:
--
--   • the author of the comment being answered → "X a répondu à ton commentaire"
--   • everybody named with "@"                 → "X t'a mentionné", observers
--                                                included: they read the thread
--                                                and being named is being
--                                                spoken to.
--   • the other participants                   → the existing "X a commenté"
--
-- Each person hears exactly once, and the most specific thing that applies:
-- being answered beats being mentioned, being mentioned beats the general
-- announcement. This is why the trigger from 20260802000000 is rewritten here
-- rather than doubled with a second one.
--
-- Depends on 20260802000000 (notify_user, display_name, space_participant_ids).
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- ── The two columns ────────────────────────────────────────────────────────

alter table public.episode_comments
  add column if not exists parent_id uuid references public.episode_comments(id) on delete cascade;

-- Deleting a comment takes its answers with it (on delete cascade above): an
-- orphaned "oui carrément" under nothing is not worth keeping.

alter table public.episode_comments
  add column if not exists mentions uuid[] not null default '{}';

-- The thread of one episode, read in order — the shape every screen asks for.
create index if not exists episode_comments_thread_idx
  on public.episode_comments (episode_id, parent_id, created_at);

-- ── Keeping threads honest ─────────────────────────────────────────────────
/*
 * Runs before every insert, so none of this depends on the client behaving:
 *
 *   • a reply to a reply becomes a reply to the root;
 *   • a comment cannot answer itself, nor a comment on another episode;
 *   • mentions are reduced to actual members of the space, deduplicated, and
 *     stripped of the author (nobody needs a notification for saying their own
 *     name).
 */
create or replace function public.episode_comments_normalize_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent record;
begin
  if new.parent_id is not null then
    select c.id, c.episode_id, c.parent_id
      into v_parent
    from public.episode_comments c
    where c.id = new.parent_id;

    if not found then
      new.parent_id := null;
    elsif v_parent.episode_id is distinct from new.episode_id then
      -- Not a thing the app can do, and not a thing to guess at either.
      raise exception 'Un commentaire ne peut répondre qu''à un commentaire du même épisode.';
    else
      -- One level, always: hang onto the root of the thread.
      new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
      if new.parent_id = new.id then
        new.parent_id := null;
      end if;
    end if;
  end if;

  if new.mentions is null then
    new.mentions := '{}';
  elsif array_length(new.mentions, 1) is not null then
    select coalesce(array_agg(distinct m.user_id), '{}')
      into new.mentions
    from public.space_members m
    where m.space_id = public.episode_space_id(new.episode_id)
      and m.user_id = any (new.mentions)
      and m.user_id is distinct from new.author_id;
  end if;

  return new;
end $$;

drop trigger if exists episode_comments_normalize on public.episode_comments;
create trigger episode_comments_normalize
before insert on public.episode_comments
for each row
execute function public.episode_comments_normalize_thread();

-- ── Who gets told ──────────────────────────────────────────────────────────
-- Replaces the version from 20260802000000. Same generic announcement at the
-- end; the two specific ones come first and take their people out of it.

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
  v_parent_author uuid;
  v_mentioned uuid[] := coalesce(new.mentions, '{}');
  v_user uuid;
  v_url text;
begin
  select e.id, e.title, e.space_id into ep from public.episodes e where e.id = new.episode_id;
  if not found then
    return null;
  end if;

  v_author := public.display_name(new.author_id);
  v_url := '/episode/' || ep.id;

  -- The comment itself, short enough for a notification banner.
  v_excerpt := btrim(coalesce(new.body, ''));
  if length(v_excerpt) > 140 then
    v_excerpt := left(v_excerpt, 139) || '…';
  end if;

  -- 1. The person being answered.
  if new.parent_id is not null then
    select c.author_id into v_parent_author
    from public.episode_comments c
    where c.id = new.parent_id;

    if v_parent_author is not null and v_parent_author is distinct from new.author_id then
      perform public.notify_user(
        v_parent_author,
        ep.space_id,
        format('%s a répondu à ton commentaire', v_author),
        nullif(v_excerpt, ''),
        v_url
      );
    end if;
  end if;

  -- 2. The people named with "@" — whatever their role. `mentions` has already
  --    been reduced to members of the space by the BEFORE trigger.
  foreach v_user in array v_mentioned loop
    if v_user is distinct from new.author_id and v_user is distinct from v_parent_author then
      perform public.notify_user(
        v_user,
        ep.space_id,
        format('%s t''a mentionné', v_author),
        coalesce(nullif(v_excerpt, ''), format('Sur l''épisode « %s ».', ep.title)),
        v_url
      );
    end if;
  end loop;

  -- 3. Everybody else who takes part in the episode.
  for v_user in select public.space_participant_ids(ep.space_id) loop
    if v_user is distinct from new.author_id
       and v_user is distinct from v_parent_author
       and not (v_user = any (v_mentioned))
    then
      perform public.notify_user(
        v_user,
        ep.space_id,
        format('%s a commenté « %s »', v_author, ep.title),
        nullif(v_excerpt, ''),
        v_url
      );
    end if;
  end loop;

  return null;
end $$;

-- Unchanged, restated so this file can be pasted on its own.
drop trigger if exists episode_comments_notify_new on public.episode_comments;
create trigger episode_comments_notify_new
after insert on public.episode_comments
for each row
execute function public.episode_comments_after_insert_notify();

commit;

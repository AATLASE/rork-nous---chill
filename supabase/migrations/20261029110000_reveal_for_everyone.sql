-- Lot 5bis (EMO-1): the whole group hears about the reveal, once.
--
-- Before: every review, the last one included, sent "X a publié sa review" to
-- the other participants, and the reveal itself only notified observers. The
-- participants learnt that their episode was open from a notification that
-- said something else, or not at all when the reveal came from a role change.
--
-- 1. The reveal notifies participants too, with a text that gives nothing
--    away. Whoever wrote the review that completed the episode gets their own
--    line; observers keep theirs.
-- 2. The review that completes an episode no longer sends "X a publié sa
--    review": the reveal notification replaces it.

-- 1. Reveal notification --------------------------------------------------------

create or replace function public.episodes_after_reveal_notify() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_space text;
  v_user uuid;
  v_closer uuid;
begin
  select s.name into v_space from public.spaces s where s.id = new.space_id;

  -- The review inserted in this same transaction is the one that completed the
  -- episode. None when the owner pressed "Révéler maintenant" or a role change
  -- did it: then everybody gets the common text.
  select r.author_id into v_closer
  from public.reviews r
  where r.episode_id = new.id and r.created_at = now()
  limit 1;

  for v_user in select public.space_participant_ids(new.space_id) loop
    perform public.notify_user(
      v_user,
      new.space_id,
      '🔓 C''est révélé !',
      case
        when v_user = v_closer then format('Tu as fermé la marche : tout est révélé sur « %s ».', new.title)
        else format('Les reviews de « %s » sont tombées.', new.title)
      end,
      '/episode/' || new.id
    );
  end loop;

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

-- 2. One notification for the last review -----------------------------------------

create or replace function public.reviews_after_insert_notify() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  ep record;
  v_author text;
  v_user uuid;
begin
  select e.id, e.title, e.space_id, e.reviews_revealed_at into ep
  from public.episodes e where e.id = new.episode_id;
  if not found then
    return null;
  end if;

  -- This review revealed the episode (the stamp is this transaction's now()):
  -- "C'est révélé" is already on its way. A late review on an episode revealed
  -- earlier by the owner is still announced.
  if ep.reviews_revealed_at = now() then
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

-- Triggers on the same event fire in name order. The old name ran before
-- reviews_reveal_episode, so the check above could never see the reveal; the
-- new one ("s" after "r") runs after it.
drop trigger if exists reviews_notify_published on public.reviews;
drop trigger if exists reviews_say_published on public.reviews;
create trigger reviews_say_published
  after insert on public.reviews
  for each row execute function public.reviews_after_insert_notify();

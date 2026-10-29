-- Rollback of 20261029110000_reveal_for_everyone.sql: the baseline versions.
CREATE OR REPLACE FUNCTION "public"."episodes_after_reveal_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."reviews_after_insert_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

drop trigger if exists reviews_say_published on public.reviews;
drop trigger if exists reviews_notify_published on public.reviews;
create trigger reviews_notify_published after insert on public.reviews
  for each row execute function public.reviews_after_insert_notify();

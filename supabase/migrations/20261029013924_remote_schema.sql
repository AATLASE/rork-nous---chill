


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_log_episode_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.log_event(
    'episode_created',
    new.space_id,
    jsonb_build_object('episode_id', new.id, 'title', new.title, 'number', new.number)
  );
  return null;
end;
$$;


ALTER FUNCTION "public"."_log_episode_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_log_invite_code_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.log_event(
    'invite_code_created',
    new.space_id,
    jsonb_build_object('role', new.role, 'max_uses', new.max_uses)
  );
  return null;
end;
$$;


ALTER FUNCTION "public"."_log_invite_code_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_log_review_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_event(
      'review_submitted',
      new.space_id,
      jsonb_build_object('episode_id', new.episode_id, 'rating', new.rating)
    );
  else
    perform public.log_event(
      'review_updated',
      new.space_id,
      jsonb_build_object('episode_id', new.episode_id, 'rating', new.rating)
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."_log_review_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_log_season_unlocked"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.season_unlocked = false and new.season_unlocked = true then
    perform public.log_event(
      'season_unlocked',
      new.id,
      jsonb_build_object('space_name', new.name)
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."_log_season_unlocked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_setting"("p_key" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select value from public.app_settings where key = p_key;
$$;


ALTER FUNCTION "public"."app_setting"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_raw text;
  v_value int;
begin
  v_raw := nullif(btrim(public.app_setting(p_key)), '');
  if v_raw is null then
    return p_default;
  end if;

  begin
    v_value := v_raw::int;
  exception
    when others then
      raise notice 'réglage % illisible (« % ») : % utilisé', p_key, v_raw, p_default;
      return p_default;
  end;

  if v_value < p_min or v_value > p_max then
    raise notice 'réglage % hors bornes (%) : % utilisé', p_key, v_value, p_default;
    return p_default;
  end if;

  return v_value;
end $$;


ALTER FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."become_aventurier"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where invite_code = v_code);
  end loop;
  update public.profiles
    set role = 'aventurier', invite_code = v_code
    where id = auth.uid();
  return v_code;
end;
$$;


ALTER FUNCTION "public"."become_aventurier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or (m.role = 'member' and coalesce(m.can_create_episodes, false)))
  );
$$;


ALTER FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_vote"("p_question_id" "uuid", "p_option" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_active       boolean;
  v_valid_option boolean;
begin
  select active, (options @> to_jsonb(p_option))
    into v_active, v_valid_option
    from public.vote_questions where id = p_question_id;

  if v_active is null    then raise exception 'question_not_found'; end if;
  if not v_active        then raise exception 'question_closed';    end if;
  if not v_valid_option  then raise exception 'invalid_option';     end if;

  -- Lève unique_violation (23505) si l'user a déjà voté → double-vote bloqué.
  insert into public.vote_ballots (question_id, voter_id) values (p_question_id, auth.uid());

  insert into public.vote_results (question_id, option, count)
  values (p_question_id, p_option, 1)
  on conflict (question_id, option) do update set count = public.vote_results.count + 1;
end;
$$;


ALTER FUNCTION "public"."cast_vote"("p_question_id" "uuid", "p_option" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_space"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_type" "text" DEFAULT 'other'::"text", "p_season_start" "date" DEFAULT CURRENT_DATE, "p_season_end" "date" DEFAULT NULL::"date", "p_cover_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_space_id uuid;
  v_slug     text;
  v_suffix   text;
begin
  v_slug := lower(regexp_replace(
    regexp_replace(p_name, '[^a-zA-Z0-9\s\-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_slug := v_slug || '-' || v_suffix;

  insert into public.spaces (name, slug, description, type, cover_url, season_start, season_end, created_by)
  values (p_name, v_slug, p_description, p_type, p_cover_url, p_season_start, p_season_end, auth.uid())
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (v_space_id, auth.uid(), 'owner');

  insert into public.synthese (space_id) values (v_space_id);

  perform public.log_event(
    'space_created',
    v_space_id,
    jsonb_build_object('name', p_name, 'type', p_type)
  );

  return v_space_id;
end;
$$;


ALTER FUNCTION "public"."create_space"("p_name" "text", "p_description" "text", "p_type" "text", "p_season_start" "date", "p_season_end" "date", "p_cover_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."display_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select nullif(btrim(p.name), '') from public.profiles p where p.id = p_user_id),
    'Quelqu''un'
  );
$$;


ALTER FUNCTION "public"."display_name"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_comments_after_insert_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."episode_comments_after_insert_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_comments_fill_space_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_space uuid;
begin
  select e.space_id into v_space from public.episodes e where e.id = new.episode_id;

  -- Unknown episode: leave the row alone and let the foreign key or the NOT NULL
  -- constraint refuse it, with its own error message.
  if v_space is not null then
    new.space_id := v_space;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."episode_comments_fill_space_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_comments_normalize_thread"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."episode_comments_normalize_thread"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.episodes e
    join public.spaces s on s.id = e.space_id
    where e.id = p_episode_id
      and (e.reviews_revealed_at is not null or s.season_unlocked)
  );
$$;


ALTER FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") RETURNS TABLE("author_id" "uuid", "submitted_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.episodes e
    join public.spaces s on s.id = e.space_id
    join public.space_members m on m.space_id = e.space_id and m.user_id = auth.uid()
    where e.id = p_episode_id
      and (e.reviews_revealed_at is not null or s.season_unlocked)
  );
$$;


ALTER FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select e.space_id from public.episodes e where e.id = p_episode_id;
$$;


ALTER FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."episodes_after_insert_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."episodes_after_insert_notify"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."episodes_after_reveal_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_space_member"("p_space_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_space_member"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_space_owner"("p_space_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_space_owner"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_space"("p_code" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite record;
  v_space  record;
begin
  select * into v_invite
  from public.invite_codes
  where code = p_code
  for update;

  if v_invite is null then
    raise exception 'invalid_invite_code';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_code_expired';
  end if;

  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    raise exception 'invite_code_exhausted';
  end if;

  if exists (
    select 1 from public.space_members
    where space_id = v_invite.space_id and user_id = auth.uid()
  ) then
    raise exception 'already_member';
  end if;

  insert into public.space_members (space_id, user_id, role, invited_by)
  values (v_invite.space_id, auth.uid(), v_invite.role, v_invite.created_by);

  update public.invite_codes
  set use_count = use_count + 1
  where id = v_invite.id;

  perform public.log_event(
    'member_joined',
    v_invite.space_id,
    jsonb_build_object('role', v_invite.role)
  );

  select row_to_json(s) into v_space from public.spaces s where s.id = v_invite.space_id;
  return v_space;
end;
$$;


ALTER FUNCTION "public"."join_space"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_space_with_code"("p_code" "text") RETURNS TABLE("space_id" "uuid", "already_member" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_invite_id uuid;
  v_space_id uuid;
begin
  if v_user is null then
    raise exception 'Connecte-toi pour rejoindre un espace.';
  end if;

  -- Codes are stored uppercase, but be forgiving about what was typed or pasted.
  select c.id, c.space_id
    into v_invite_id, v_space_id
  from public.invite_codes c
  where upper(c.code) = upper(btrim(p_code))
  limit 1;

  if v_space_id is null then
    raise exception 'Code invalide. Vérifie-le auprès du propriétaire de l''espace.';
  end if;

  if exists (
    select 1 from public.space_members m
    where m.space_id = v_space_id and m.user_id = v_user
  ) then
    return query select v_space_id, true;
    return;
  end if;

  -- Everyone enters as an observer; the owner promotes participants afterwards.
  insert into public.space_members (space_id, user_id, role, can_create_episodes)
  values (v_space_id, v_user, 'observer', false);

  update public.invite_codes
  set use_count = coalesce(use_count, 0) + 1
  where id = v_invite_id;

  return query select v_space_id, false;
end;
$$;


ALTER FUNCTION "public"."join_space_with_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_event"("p_action" "text", "p_space_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.audit_logs (user_id, space_id, action, metadata)
  values (auth.uid(), p_space_id, p_action, p_metadata);
$$;


ALTER FUNCTION "public"."log_event"("p_action" "text", "p_space_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mcp_execute_sql"("query_params" "jsonb", "query_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE query_text INTO result;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."mcp_execute_sql"("query_params" "jsonb", "query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_can_create_episodes"("p_space_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(can_create_episodes, false) from public.space_members
  where space_id = p_space_id and user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."my_can_create_episodes"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_is_contributor"("p_space_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id
      and user_id = auth.uid()
      and (role = 'owner' or (role = 'member' and can_create_episodes))
  );
$$;


ALTER FUNCTION "public"."my_is_contributor"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_space_role"("p_space_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.space_members
  where space_id = p_space_id and user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."my_space_role"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notification_timezone"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tz text;
begin
  v_tz := coalesce(nullif(btrim(public.app_setting('daily_prompt_timezone')), ''), 'Europe/Paris');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise notice 'fuseau « % » inconnu : Europe/Paris utilisé', v_tz;
    return 'Europe/Paris';
  end if;
  return v_tz;
end $$;


ALTER FUNCTION "public"."notification_timezone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifications_after_insert_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url text;
  v_secret text;
begin
  v_url := public.app_setting('push_function_url');
  v_secret := public.app_setting('push_webhook_secret');

  -- Not configured yet: the notification is written, nothing is sent. This is
  -- the state the app ships in, and it is a working state.
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception
  when others then
    -- pg_net missing, function unreachable, anything: the notification stays.
    raise notice 'push non envoyé pour la notification % : %', new.id, sqlerrm;
    return null;
end $$;


ALTER FUNCTION "public"."notifications_after_insert_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_space"("p_space_id" "uuid", "p_title" "text", "p_body" "text" DEFAULT NULL::"text", "p_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications (user_id, space_id, title, body, url)
  select sm.user_id, p_space_id, p_title, p_body, p_url
  from public.space_members sm
  where sm.space_id = p_space_id
    and sm.user_id <> auth.uid();
end;
$$;


ALTER FUNCTION "public"."notify_space"("p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_space_media_path"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.space_members m
    where m.user_id = auth.uid()
      and m.space_id::text = any (storage.foldername(p_name))
  );
$$;


ALTER FUNCTION "public"."owns_space_media_path"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reveal_episode_reviews_if_complete"("p_episode_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."reveal_episode_reviews_if_complete"("p_episode_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."reviews_after_insert_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reviews_after_insert_reveal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.reveal_episode_reviews_if_complete(new.episode_id);
  return null;
end $$;


ALTER FUNCTION "public"."reviews_after_insert_reveal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_daily_story_prompt"("p_force" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tz text;
  v_hour int;
  v_local timestamp;
  v_date date;
  v_sent int := 0;
  rec record;
  v_space text;
  v_url text;
  v_space_id uuid;
begin
  v_tz := coalesce(nullif(btrim(public.app_setting('daily_prompt_timezone')), ''), 'Europe/Paris');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise notice 'fuseau « % » inconnu : Europe/Paris utilisé', v_tz;
    v_tz := 'Europe/Paris';
  end if;

  begin
    v_hour := coalesce(nullif(btrim(public.app_setting('daily_prompt_hour')), ''), '20')::int;
  exception
    when others then
      v_hour := 20;
  end;
  if v_hour < 0 or v_hour > 23 then
    v_hour := 20;
  end if;

  v_local := now() at time zone v_tz;
  v_date := v_local::date;

  -- Le reste des heures de la journée s'arrête ici.
  if not p_force and extract(hour from v_local)::int is distinct from v_hour then
    return 0;
  end if;

  for rec in
    -- Les participants, au sens de space_participant_ids (20260802000000), mais
    -- pris dans l'autre sens : les espaces de chaque personne plutôt que les
    -- personnes de chaque espace.
    with participants as (
      select m.user_id, m.space_id
      from public.space_members m
      where coalesce(m.role::text, 'observer') = 'owner'
         or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
    )
    select
      p.user_id,
      count(*) as space_count,
      (array_agg(p.space_id order by p.space_id))[1] as first_space
    from participants p
    where not exists (
      -- Déjà raconté quelque chose aujourd'hui : on ne le lui redemande pas.
      select 1
      from public.episodes e
      where e.created_by = p.user_id
        and (e.created_at at time zone v_tz)::date = v_date
    )
    group by p.user_id
  loop
    -- C'est cette ligne, et elle seule, qui autorise la notification. Si elle
    -- existe déjà, quelqu'un (ou un autre worker) l'a envoyée avant nous.
    insert into public.daily_prompt_log (user_id, prompt_date)
    values (rec.user_id, v_date)
    on conflict do nothing;

    if not found then
      continue;
    end if;

    if rec.space_count = 1 then
      v_space_id := rec.first_space;
      select s.name into v_space from public.spaces s where s.id = v_space_id;
      v_url := '/create-episode/' || v_space_id;
    else
      -- Plusieurs aventures : le choix lui appartient, on le dépose à l'accueil.
      v_space_id := null;
      v_space := null;
      v_url := '/';
    end if;

    perform public.notify_user(
      rec.user_id,
      v_space_id,
      'Quelque chose à raconter aujourd''hui ?',
      case
        when v_space is not null then
          format('Un moment à garder dans « %s » ? Ajoute l''épisode, chacun écrira sa review.', v_space)
        else
          'Un moment à garder ? Ajoute un épisode dans une de tes aventures.'
      end,
      v_url
    );

    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end $$;


ALTER FUNCTION "public"."send_daily_story_prompt"("p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_review_reminders"("p_force" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tz text;
  v_delay int;
  v_max int;
  v_window int;
  v_quiet_start int;
  v_quiet_end int;
  v_hour int;
  v_awake boolean;
  v_sent int := 0;
  rec record;
  v_due timestamptz;
  v_no int;
  v_names text[];
  v_who text;
  v_last boolean;
begin
  v_delay := public.app_setting_int('review_reminder_delay_minutes', 90, 1, 10080);
  v_max := public.app_setting_int('review_reminder_max', 2, 0, 10);
  v_window := public.app_setting_int('review_reminder_window_hours', 168, 1, 8760);
  v_quiet_start := public.app_setting_int('review_reminder_quiet_start', 22, 0, 23);
  v_quiet_end := public.app_setting_int('review_reminder_quiet_end', 8, 0, 23);

  -- Éteint volontairement.
  if v_max <= 0 then
    return 0;
  end if;

  v_tz := public.notification_timezone();
  v_hour := extract(hour from now() at time zone v_tz)::int;

  -- Deux bornes égales : personne ne dort, tout part à l'heure dite.
  if v_quiet_start = v_quiet_end then
    v_awake := true;
  elsif v_quiet_end < v_quiet_start then
    -- La nuit ordinaire, 22h → 8h : elle enjambe minuit.
    v_awake := v_hour >= v_quiet_end and v_hour < v_quiet_start;
  else
    -- Une pause en plein jour, si quelqu'un y tient.
    v_awake := v_hour >= v_quiet_end or v_hour < v_quiet_start;
  end if;

  if not p_force and not v_awake then
    return 0;
  end if;

  for rec in
    with pending as (
      -- Les participants (même règle que space_participant_ids) qui n'ont pas
      -- encore publié, sur un épisode encore scellé où quelqu'un a déjà répondu.
      select
        e.id as episode_id,
        e.space_id,
        e.title,
        m.user_id
      from public.episodes e
      join public.space_members m
        on m.space_id = e.space_id
       and (
         coalesce(m.role::text, 'observer') = 'owner'
         or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
       )
      where e.reviews_revealed_at is null
        and not exists (
          select 1 from public.reviews r
          where r.episode_id = e.id and r.author_id = m.user_id
        )
    )
    select
      p.episode_id,
      p.space_id,
      p.title,
      p.user_id,
      (select max(r.created_at) from public.reviews r where r.episode_id = p.episode_id) as last_review_at,
      (select count(*) from public.review_reminder_log l
        where l.episode_id = p.episode_id and l.user_id = p.user_id) as sent_so_far,
      (select max(l.sent_at) from public.review_reminder_log l
        where l.episode_id = p.episode_id and l.user_id = p.user_id) as last_reminder_at
    from pending p
  loop
    -- Aucune review encore : rien ne s'est passé dont on puisse relancer.
    if rec.last_review_at is null then
      continue;
    end if;

    -- Trop vieux : l'épisode ne se remplira plus, on ne le poursuit pas.
    if rec.last_review_at < now() - make_interval(hours => v_window) then
      continue;
    end if;

    if rec.sent_so_far >= v_max then
      continue;
    end if;

    -- greatest() ignore les NULL : avant la première relance, l'échéance ne
    -- dépend que de la dernière review.
    v_due := greatest(rec.last_review_at, rec.last_reminder_at) + make_interval(mins => v_delay);
    if now() < v_due then
      continue;
    end if;

    v_no := rec.sent_so_far + 1;

    -- La ligne d'abord : c'est elle qui donne le droit d'envoyer. Si une autre
    -- exécution l'a déjà écrite, elle a déjà envoyé.
    insert into public.review_reminder_log (episode_id, user_id, reminder_no)
    values (rec.episode_id, rec.user_id, v_no)
    on conflict do nothing;

    if not found then
      continue;
    end if;

    -- Qui a déjà répondu, dit comme on le dirait à voix haute.
    select array_agg(public.display_name(r.author_id) order by r.created_at)
      into v_names
    from public.reviews r
    where r.episode_id = rec.episode_id;

    v_who := case
      when v_names is null or array_length(v_names, 1) is null then null
      when array_length(v_names, 1) = 1 then format('%s a déjà écrit la sienne.', v_names[1])
      when array_length(v_names, 1) = 2 then format('%s et %s ont déjà écrit la leur.', v_names[1], v_names[2])
      else format('%s, %s et %s autres ont déjà écrit la leur.', v_names[1], v_names[2], array_length(v_names, 1) - 2)
    end;

    v_last := v_no >= v_max;

    perform public.notify_user(
      rec.user_id,
      rec.space_id,
      case
        when v_last then format('Dernier rappel : ta review sur « %s »', rec.title)
        else format('Il manque ta review sur « %s »', rec.title)
      end,
      trim(both ' ' from concat_ws(
        ' ',
        v_who,
        'Personne ne peut lire les autres tant que la tienne manque.',
        case when v_last then 'Promis, on n''en reparle plus.' else null end
      )),
      '/review/' || rec.episode_id
    );

    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end $$;


ALTER FUNCTION "public"."send_review_reminders"("p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_comment_author_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  select name into new.author_name from public.profiles where id = new.author_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_comment_author_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_episode_permission"("p_space_id" "uuid", "p_user_id" "uuid", "p_can_create" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'only the owner can change episode permissions';
  end if;

  update public.space_members
  set can_create_episodes = p_can_create
  where space_id = p_space_id
    and user_id = p_user_id
    and role = 'member';

  perform public.log_event(
    case when p_can_create then 'member_promoted' else 'member_demoted' end,
    p_space_id,
    jsonb_build_object('target_user_id', p_user_id)
  );
end;
$$;


ALTER FUNCTION "public"."set_member_episode_permission"("p_space_id" "uuid", "p_user_id" "uuid", "p_can_create" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_review_author_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  select name into new.author_name from public.profiles where id = new.author_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_review_author_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."space_members_after_change_reveal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."space_members_after_change_reveal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."space_members_after_insert_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_space text;
  v_newcomer text;
  v_owner uuid;
  v_user uuid;
  v_url text;
begin
  -- The creator's own row, written by the "create space" flow.
  if coalesce(new.role::text, 'observer') = 'owner' then
    return null;
  end if;

  select s.name into v_space from public.spaces s where s.id = new.space_id;
  v_newcomer := public.display_name(new.user_id);
  v_url := '/space-members/' || new.space_id;

  -- The membership row is the source of truth for who owns the space (it is
  -- what the app reads), with the space's creator as a fallback for rows that
  -- predate it.
  select m.user_id into v_owner
  from public.space_members m
  where m.space_id = new.space_id and coalesce(m.role::text, '') = 'owner'
  limit 1;

  if v_owner is null then
    select s.created_by into v_owner from public.spaces s where s.id = new.space_id;
  end if;

  if v_owner is not null and v_owner is distinct from new.user_id then
    perform public.notify_user(
      v_owner,
      new.space_id,
      format('%s a rejoint « %s »', v_newcomer, coalesce(v_space, 'ton aventure')),
      format(
        '%s est observateur pour l''instant. Autorise-la à participer depuis les membres.',
        v_newcomer
      ),
      v_url
    );
  end if;

  -- The other participants: the news, without the button they do not have.
  for v_user in select public.space_participant_ids(new.space_id) loop
    if v_user is distinct from new.user_id and v_user is distinct from v_owner then
      perform public.notify_user(
        v_user,
        new.space_id,
        format('%s a rejoint « %s »', v_newcomer, coalesce(v_space, 'votre aventure')),
        'Une personne de plus dans l''aventure.',
        v_url
      );
    end if;
  end loop;

  return null;
end $$;


ALTER FUNCTION "public"."space_members_after_insert_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.user_id
  from public.space_members m
  where m.space_id = p_space_id
    and not (
      coalesce(m.role::text, 'observer') = 'owner'
      or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
    );
$$;


ALTER FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.user_id
  from public.space_members m
  where m.space_id = p_space_id
    and (
      coalesce(m.role::text, 'observer') = 'owner'
      or (coalesce(m.role::text, 'observer') = 'member' and coalesce(m.can_create_episodes, false))
    );
$$;


ALTER FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."use_invite_code"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.profiles where invite_code = p_code) then
    raise exception 'invalid_invite_code';
  end if;
  update public.profiles set role = 'ami' where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."use_invite_code"("p_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "space_id" "uuid",
    "action" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_reactions" (
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_prompt_log" (
    "user_id" "uuid" NOT NULL,
    "prompt_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_prompt_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."episode_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "space_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "mentions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL
);


ALTER TABLE "public"."episode_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."episode_likes" (
    "episode_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."episode_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."episode_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "space_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content_type" "text",
    "size" bigint,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "episode_media_type_check" CHECK (("type" = ANY (ARRAY['image'::"text", 'video'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."episode_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."episodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" NOT NULL,
    "place" "text" NOT NULL,
    "duration" "text",
    "tags" "text"[],
    "cover_url" "text",
    "notes" "text",
    "music_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviews_revealed_at" timestamp with time zone
);


ALTER TABLE "public"."episodes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."episodes"."reviews_revealed_at" IS 'Set once every participant of the space has published a review for this episode. Never cleared.';



CREATE TABLE IF NOT EXISTS "public"."idea_votes" (
    "idea_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "idea_votes_kind_check" CHECK (("kind" = ANY (ARRAY['like'::"text", 'dislike'::"text"])))
);


ALTER TABLE "public"."idea_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "proposed_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'voting'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ideas_status_check" CHECK (("status" = ANY (ARRAY['voting'::"text", 'selected'::"text", 'scheduled'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."ideas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invite_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "space_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invite_codes_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'observer'::"text"])))
);


ALTER TABLE "public"."invite_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "space_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text",
    "url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "avatar_url" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'ami'::"text" NOT NULL,
    "invite_code" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['aventurier'::"text", 'ami'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_reminder_log" (
    "episode_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reminder_no" smallint NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_reminder_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "space_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "rating" integer NOT NULL,
    "favorite_moment" "text",
    "awkward_moment" "text",
    "funny_quote" "text",
    "summary" "text",
    "would_redo" "text",
    "song" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_would_redo_check" CHECK (("would_redo" = ANY (ARRAY['yes'::"text", 'no'::"text", 'maybe'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."space_members" (
    "space_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_create_episodes" boolean DEFAULT false NOT NULL,
    CONSTRAINT "space_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text", 'observer'::"text"])))
);


ALTER TABLE "public"."space_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cover_url" "text",
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "season_start" "date",
    "season_end" "date",
    "season_unlocked" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spaces_type_check" CHECK (("type" = ANY (ARRAY['couple'::"text", 'friends'::"text", 'family'::"text", 'event'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."spaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."synthese" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "body_md" "text",
    "generated_at" timestamp with time zone,
    "avg_rating" numeric,
    "best_episode_id" "uuid",
    "video_url" "text",
    "video_generated_at" timestamp with time zone
);


ALTER TABLE "public"."synthese" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vote_ballots" (
    "question_id" "uuid" NOT NULL,
    "voter_id" "uuid" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vote_ballots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vote_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vote_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vote_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "option" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."vote_results" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."daily_prompt_log"
    ADD CONSTRAINT "daily_prompt_log_pkey" PRIMARY KEY ("user_id", "prompt_date");



ALTER TABLE ONLY "public"."episode_comments"
    ADD CONSTRAINT "episode_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."episode_likes"
    ADD CONSTRAINT "episode_likes_pkey" PRIMARY KEY ("episode_id", "user_id");



ALTER TABLE ONLY "public"."episode_media"
    ADD CONSTRAINT "episode_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_space_id_number_key" UNIQUE ("space_id", "number");



ALTER TABLE ONLY "public"."idea_votes"
    ADD CONSTRAINT "idea_votes_pkey" PRIMARY KEY ("idea_id", "user_id");



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."review_reminder_log"
    ADD CONSTRAINT "review_reminder_log_pkey" PRIMARY KEY ("episode_id", "user_id", "reminder_no");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_episode_id_author_id_key" UNIQUE ("episode_id", "author_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_pkey" PRIMARY KEY ("space_id", "user_id");



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."synthese"
    ADD CONSTRAINT "synthese_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."synthese"
    ADD CONSTRAINT "synthese_space_id_key" UNIQUE ("space_id");



ALTER TABLE ONLY "public"."vote_ballots"
    ADD CONSTRAINT "vote_ballots_pkey" PRIMARY KEY ("question_id", "voter_id");



ALTER TABLE ONLY "public"."vote_questions"
    ADD CONSTRAINT "vote_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vote_results"
    ADD CONSTRAINT "vote_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vote_results"
    ADD CONSTRAINT "vote_results_question_id_option_key" UNIQUE ("question_id", "option");



CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "audit_logs_space_id_created_at_idx" ON "public"."audit_logs" USING "btree" ("space_id", "created_at" DESC);



CREATE INDEX "audit_logs_user_id_created_at_idx" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "comment_reactions_comment_id_idx" ON "public"."comment_reactions" USING "btree" ("comment_id");



CREATE INDEX "episode_comments_episode_id_idx" ON "public"."episode_comments" USING "btree" ("episode_id");



CREATE INDEX "episode_comments_space_id_idx" ON "public"."episode_comments" USING "btree" ("space_id");



CREATE INDEX "episode_comments_thread_idx" ON "public"."episode_comments" USING "btree" ("episode_id", "parent_id", "created_at");



CREATE INDEX "episode_likes_episode_id_idx" ON "public"."episode_likes" USING "btree" ("episode_id");



CREATE INDEX "episode_media_episode_id_idx" ON "public"."episode_media" USING "btree" ("episode_id");



CREATE INDEX "episode_media_space_id_idx" ON "public"."episode_media" USING "btree" ("space_id");



CREATE INDEX "episodes_creator_created_idx" ON "public"."episodes" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "episodes_space_id_date_idx" ON "public"."episodes" USING "btree" ("space_id", "date" DESC);



CREATE INDEX "episodes_space_id_idx" ON "public"."episodes" USING "btree" ("space_id");



CREATE INDEX "idea_votes_idea_id_idx" ON "public"."idea_votes" USING "btree" ("idea_id");



CREATE INDEX "ideas_space_id_idx" ON "public"."ideas" USING "btree" ("space_id");



CREATE INDEX "invite_codes_code_idx" ON "public"."invite_codes" USING "btree" ("code");



CREATE INDEX "invite_codes_space_id_idx" ON "public"."invite_codes" USING "btree" ("space_id");



CREATE UNIQUE INDEX "invite_codes_space_id_key" ON "public"."invite_codes" USING "btree" ("space_id");



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_id_created_at_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "public"."push_subscriptions" USING "btree" ("endpoint");



CREATE INDEX "reviews_author_id_idx" ON "public"."reviews" USING "btree" ("author_id");



CREATE INDEX "reviews_episode_created_idx" ON "public"."reviews" USING "btree" ("episode_id", "created_at" DESC);



CREATE INDEX "reviews_episode_id_idx" ON "public"."reviews" USING "btree" ("episode_id");



CREATE INDEX "reviews_space_id_idx" ON "public"."reviews" USING "btree" ("space_id");



CREATE INDEX "space_members_space_id_idx" ON "public"."space_members" USING "btree" ("space_id");



CREATE INDEX "space_members_user_id_idx" ON "public"."space_members" USING "btree" ("user_id");



CREATE INDEX "vote_questions_space_id_idx" ON "public"."vote_questions" USING "btree" ("space_id");



CREATE INDEX "vote_results_question_id_idx" ON "public"."vote_results" USING "btree" ("question_id");



CREATE OR REPLACE TRIGGER "episode_comments_normalize" BEFORE INSERT ON "public"."episode_comments" FOR EACH ROW EXECUTE FUNCTION "public"."episode_comments_normalize_thread"();



CREATE OR REPLACE TRIGGER "episode_comments_notify_new" AFTER INSERT ON "public"."episode_comments" FOR EACH ROW EXECUTE FUNCTION "public"."episode_comments_after_insert_notify"();



CREATE OR REPLACE TRIGGER "episode_comments_set_author" BEFORE INSERT ON "public"."episode_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_comment_author_snapshot"();



CREATE OR REPLACE TRIGGER "episode_comments_set_space_id" BEFORE INSERT OR UPDATE OF "episode_id" ON "public"."episode_comments" FOR EACH ROW EXECUTE FUNCTION "public"."episode_comments_fill_space_id"();



CREATE OR REPLACE TRIGGER "episodes_notify_new" AFTER INSERT ON "public"."episodes" FOR EACH ROW EXECUTE FUNCTION "public"."episodes_after_insert_notify"();



CREATE OR REPLACE TRIGGER "episodes_notify_reveal" AFTER UPDATE OF "reviews_revealed_at" ON "public"."episodes" FOR EACH ROW WHEN ((("old"."reviews_revealed_at" IS NULL) AND ("new"."reviews_revealed_at" IS NOT NULL))) EXECUTE FUNCTION "public"."episodes_after_reveal_notify"();



CREATE OR REPLACE TRIGGER "episodes_set_updated_at" BEFORE UPDATE ON "public"."episodes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ideas_set_updated_at" BEFORE UPDATE ON "public"."ideas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "log_episode_created" AFTER INSERT ON "public"."episodes" FOR EACH ROW EXECUTE FUNCTION "public"."_log_episode_created"();



CREATE OR REPLACE TRIGGER "log_invite_code_created" AFTER INSERT ON "public"."invite_codes" FOR EACH ROW EXECUTE FUNCTION "public"."_log_invite_code_created"();



CREATE OR REPLACE TRIGGER "log_review_event" AFTER INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."_log_review_event"();



CREATE OR REPLACE TRIGGER "log_season_unlocked" AFTER UPDATE ON "public"."spaces" FOR EACH ROW EXECUTE FUNCTION "public"."_log_season_unlocked"();



CREATE OR REPLACE TRIGGER "notifications_send_push" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."notifications_after_insert_push"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "reviews_notify_published" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."reviews_after_insert_notify"();



CREATE OR REPLACE TRIGGER "reviews_reveal_episode" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."reviews_after_insert_reveal"();



CREATE OR REPLACE TRIGGER "reviews_set_author" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_review_author_snapshot"();



CREATE OR REPLACE TRIGGER "reviews_set_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "space_members_notify_join" AFTER INSERT ON "public"."space_members" FOR EACH ROW EXECUTE FUNCTION "public"."space_members_after_insert_notify"();



CREATE OR REPLACE TRIGGER "space_members_reveal_episodes" AFTER DELETE OR UPDATE ON "public"."space_members" FOR EACH ROW EXECUTE FUNCTION "public"."space_members_after_change_reveal"();



CREATE OR REPLACE TRIGGER "spaces_set_updated_at" BEFORE UPDATE ON "public"."spaces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."episode_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_prompt_log"
    ADD CONSTRAINT "daily_prompt_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_comments"
    ADD CONSTRAINT "episode_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_comments"
    ADD CONSTRAINT "episode_comments_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_comments"
    ADD CONSTRAINT "episode_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."episode_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_comments"
    ADD CONSTRAINT "episode_comments_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_likes"
    ADD CONSTRAINT "episode_likes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_likes"
    ADD CONSTRAINT "episode_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_media"
    ADD CONSTRAINT "episode_media_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_media"
    ADD CONSTRAINT "episode_media_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episode_media"
    ADD CONSTRAINT "episode_media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idea_votes"
    ADD CONSTRAINT "idea_votes_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idea_votes"
    ADD CONSTRAINT "idea_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_reminder_log"
    ADD CONSTRAINT "review_reminder_log_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_reminder_log"
    ADD CONSTRAINT "review_reminder_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."synthese"
    ADD CONSTRAINT "synthese_best_episode_id_fkey" FOREIGN KEY ("best_episode_id") REFERENCES "public"."episodes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."synthese"
    ADD CONSTRAINT "synthese_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vote_ballots"
    ADD CONSTRAINT "vote_ballots_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."vote_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vote_ballots"
    ADD CONSTRAINT "vote_ballots_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vote_questions"
    ADD CONSTRAINT "vote_questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vote_questions"
    ADD CONSTRAINT "vote_questions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vote_results"
    ADD CONSTRAINT "vote_results_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."vote_questions"("id") ON DELETE CASCADE;



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert_deny" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "audit_logs_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."my_space_role"("space_id") = 'owner'::"text")));



ALTER TABLE "public"."comment_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_reactions_delete_own" ON "public"."comment_reactions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "comment_reactions_insert_own" ON "public"."comment_reactions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "comment_reactions_select_member" ON "public"."comment_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."episode_comments" "ec"
     JOIN "public"."space_members" "sm" ON (("sm"."space_id" = "ec"."space_id")))
  WHERE (("ec"."id" = "comment_reactions"."comment_id") AND ("sm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."daily_prompt_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "episode comments: author or space owner deletes" ON "public"."episode_comments" FOR DELETE TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."is_space_owner"("public"."episode_space_id"("episode_id"))));



CREATE POLICY "episode comments: authors edit their own" ON "public"."episode_comments" FOR UPDATE TO "authenticated" USING (("author_id" = "auth"."uid"())) WITH CHECK (("author_id" = "auth"."uid"()));



CREATE POLICY "episode comments: members of the space read" ON "public"."episode_comments" FOR SELECT TO "authenticated" USING ("public"."is_space_member"("public"."episode_space_id"("episode_id")));



CREATE POLICY "episode comments: participants always, the space once revealed" ON "public"."episode_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."is_space_member"("public"."episode_space_id"("episode_id")) AND ("public"."can_review_in_space"("public"."episode_space_id"("episode_id")) OR "public"."episode_is_revealed"("episode_id"))));



CREATE POLICY "episode media: uploader or space owner deletes" ON "public"."episode_media" FOR DELETE TO "authenticated" USING ((("uploaded_by" = "auth"."uid"()) OR "public"."is_space_owner"("space_id")));



ALTER TABLE "public"."episode_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."episode_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "episode_likes_delete_own" ON "public"."episode_likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "episode_likes_insert_own" ON "public"."episode_likes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "episode_likes_select_member" ON "public"."episode_likes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."episodes" "e"
     JOIN "public"."space_members" "sm" ON (("sm"."space_id" = "e"."space_id")))
  WHERE (("e"."id" = "episode_likes"."episode_id") AND ("sm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."episode_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "episode_media_delete_uploader_or_owner" ON "public"."episode_media" FOR DELETE TO "authenticated" USING ((("uploaded_by" = "auth"."uid"()) OR ("public"."my_space_role"("space_id") = 'owner'::"text")));



CREATE POLICY "episode_media_insert_owner_member" ON "public"."episode_media" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND "public"."my_is_contributor"("space_id")));



CREATE POLICY "episode_media_select_member" ON "public"."episode_media" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



ALTER TABLE "public"."episodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "episodes: author or space owner deletes" ON "public"."episodes" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."is_space_owner"("space_id")));



CREATE POLICY "episodes_delete_owner" ON "public"."episodes" FOR DELETE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



CREATE POLICY "episodes_insert_owner_or_contributor" ON "public"."episodes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."my_is_contributor"("space_id")));



CREATE POLICY "episodes_select_member" ON "public"."episodes" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



CREATE POLICY "episodes_update_owner" ON "public"."episodes" FOR UPDATE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



ALTER TABLE "public"."idea_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "idea_votes_delete_own" ON "public"."idea_votes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "idea_votes_insert_own" ON "public"."idea_votes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "idea_votes_select_member" ON "public"."idea_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."ideas" "i"
     JOIN "public"."space_members" "sm" ON (("sm"."space_id" = "i"."space_id")))
  WHERE (("i"."id" = "idea_votes"."idea_id") AND ("sm"."user_id" = "auth"."uid"())))));



CREATE POLICY "idea_votes_update_own" ON "public"."idea_votes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ideas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_insert_owner_member" ON "public"."ideas" FOR INSERT TO "authenticated" WITH CHECK ((("proposed_by" = "auth"."uid"()) AND "public"."my_is_contributor"("space_id")));



CREATE POLICY "ideas_select_member" ON "public"."ideas" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



CREATE POLICY "ideas_update_owner" ON "public"."ideas" FOR UPDATE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



ALTER TABLE "public"."invite_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invite_codes_delete_owner" ON "public"."invite_codes" FOR DELETE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



CREATE POLICY "invite_codes_insert_owner" ON "public"."invite_codes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."my_space_role"("space_id") = 'owner'::"text")));



CREATE POLICY "invite_codes_select_member" ON "public"."invite_codes" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: clear your own" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications: mark your own read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications: read your own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "push subscriptions: forget your own device" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push subscriptions: register your own device" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "push subscriptions: your own devices" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_reminder_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews: author or space owner deletes" ON "public"."reviews" FOR DELETE TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."is_space_owner"("public"."episode_space_id"("episode_id"))));



CREATE POLICY "reviews: authors edit their own" ON "public"."reviews" FOR UPDATE TO "authenticated" USING (("author_id" = "auth"."uid"())) WITH CHECK (("author_id" = "auth"."uid"()));



CREATE POLICY "reviews: mine, or the whole episode once revealed" ON "public"."reviews" FOR SELECT TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."episode_reviews_visible"("episode_id")));



CREATE POLICY "reviews: participants write their own" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."can_review_in_space"("public"."episode_space_id"("episode_id"))));



ALTER TABLE "public"."space_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "space_members_delete_owner_or_self" ON "public"."space_members" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."my_space_role"("space_id") = 'owner'::"text")));



CREATE POLICY "space_members_insert_owner" ON "public"."space_members" FOR INSERT TO "authenticated" WITH CHECK (("public"."my_space_role"("space_id") = 'owner'::"text"));



CREATE POLICY "space_members_insert_self" ON "public"."space_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "space_members_select" ON "public"."space_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "space_members_select_member" ON "public"."space_members" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



CREATE POLICY "space_members_select_self" ON "public"."space_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "space_members_update_owner" ON "public"."space_members" FOR UPDATE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



ALTER TABLE "public"."spaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spaces_delete_owner" ON "public"."spaces" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."space_members" "sm"
  WHERE (("sm"."space_id" = "spaces"."id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = 'owner'::"text")))));



CREATE POLICY "spaces_insert_authenticated" ON "public"."spaces" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "spaces_insert_own" ON "public"."spaces" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "spaces_select" ON "public"."spaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."space_members" "sm"
  WHERE (("sm"."space_id" = "spaces"."id") AND ("sm"."user_id" = "auth"."uid"())))));



CREATE POLICY "spaces_select_creator" ON "public"."spaces" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "spaces_select_member" ON "public"."spaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."space_members" "m"
  WHERE (("m"."space_id" = "spaces"."id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "spaces_update_owner" ON "public"."spaces" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."space_members" "sm"
  WHERE (("sm"."space_id" = "spaces"."id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = 'owner'::"text")))));



ALTER TABLE "public"."synthese" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "synthese_select_member" ON "public"."synthese" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



CREATE POLICY "synthese_write_owner" ON "public"."synthese" TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text")) WITH CHECK (("public"."my_space_role"("space_id") = 'owner'::"text"));



ALTER TABLE "public"."vote_ballots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vote_ballots_select_own" ON "public"."vote_ballots" FOR SELECT TO "authenticated" USING (("voter_id" = "auth"."uid"()));



ALTER TABLE "public"."vote_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vote_questions_insert_owner" ON "public"."vote_questions" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."my_space_role"("space_id") = 'owner'::"text")));



CREATE POLICY "vote_questions_select_member" ON "public"."vote_questions" FOR SELECT TO "authenticated" USING (("public"."my_space_role"("space_id") IS NOT NULL));



CREATE POLICY "vote_questions_update_owner" ON "public"."vote_questions" FOR UPDATE TO "authenticated" USING (("public"."my_space_role"("space_id") = 'owner'::"text"));



ALTER TABLE "public"."vote_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vote_results_select_member" ON "public"."vote_results" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."vote_questions" "vq"
     JOIN "public"."space_members" "sm" ON (("sm"."space_id" = "vq"."space_id")))
  WHERE (("vq"."id" = "vote_results"."question_id") AND ("sm"."user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_log_episode_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."_log_episode_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_log_episode_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_log_invite_code_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."_log_invite_code_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_log_invite_code_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_log_review_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."_log_review_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_log_review_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_log_season_unlocked"() TO "anon";
GRANT ALL ON FUNCTION "public"."_log_season_unlocked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_log_season_unlocked"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."app_setting"("p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_setting"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."app_setting"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_setting"("p_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_setting_int"("p_key" "text", "p_default" integer, "p_min" integer, "p_max" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."become_aventurier"() TO "anon";
GRANT ALL ON FUNCTION "public"."become_aventurier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."become_aventurier"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_review_in_space"("p_space_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cast_vote"("p_question_id" "uuid", "p_option" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_vote"("p_question_id" "uuid", "p_option" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_vote"("p_question_id" "uuid", "p_option" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_space"("p_name" "text", "p_description" "text", "p_type" "text", "p_season_start" "date", "p_season_end" "date", "p_cover_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_space"("p_name" "text", "p_description" "text", "p_type" "text", "p_season_start" "date", "p_season_end" "date", "p_cover_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_space"("p_name" "text", "p_description" "text", "p_type" "text", "p_season_start" "date", "p_season_end" "date", "p_cover_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."display_name"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."display_name"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."display_name"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."display_name"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."episode_comments_after_insert_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."episode_comments_after_insert_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_comments_after_insert_notify"() TO "service_role";



GRANT ALL ON FUNCTION "public"."episode_comments_fill_space_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."episode_comments_fill_space_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_comments_fill_space_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."episode_comments_normalize_thread"() TO "anon";
GRANT ALL ON FUNCTION "public"."episode_comments_normalize_thread"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_comments_normalize_thread"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_is_revealed"("p_episode_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_review_authors"("p_episode_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_reviews_visible"("p_episode_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."episode_space_id"("p_episode_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."episodes_after_insert_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."episodes_after_insert_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."episodes_after_insert_notify"() TO "service_role";



GRANT ALL ON FUNCTION "public"."episodes_after_reveal_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."episodes_after_reveal_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."episodes_after_reveal_notify"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_space_member"("p_space_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_space_member"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_space_member"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_space_member"("p_space_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_space_owner"("p_space_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_space_owner"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_space_owner"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_space_owner"("p_space_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_space"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_space"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_space"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_space_with_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_space_with_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_space_with_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_space_with_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_space_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_space_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_space_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mcp_execute_sql"("query_params" "jsonb", "query_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mcp_execute_sql"("query_params" "jsonb", "query_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mcp_execute_sql"("query_params" "jsonb", "query_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_can_create_episodes"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."my_can_create_episodes"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_can_create_episodes"("p_space_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_is_contributor"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."my_is_contributor"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_is_contributor"("p_space_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_space_role"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."my_space_role"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_space_role"("p_space_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notification_timezone"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notification_timezone"() TO "anon";
GRANT ALL ON FUNCTION "public"."notification_timezone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notification_timezone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notifications_after_insert_push"() TO "anon";
GRANT ALL ON FUNCTION "public"."notifications_after_insert_push"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notifications_after_insert_push"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_space"("p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_space"("p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_space"("p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_space_id" "uuid", "p_title" "text", "p_body" "text", "p_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_space_media_path"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_space_media_path"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_space_media_path"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_space_media_path"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reveal_episode_reviews_if_complete"("p_episode_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reveal_episode_reviews_if_complete"("p_episode_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reveal_episode_reviews_if_complete"("p_episode_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reviews_after_insert_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."reviews_after_insert_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reviews_after_insert_notify"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reviews_after_insert_reveal"() TO "anon";
GRANT ALL ON FUNCTION "public"."reviews_after_insert_reveal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reviews_after_insert_reveal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_daily_story_prompt"("p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_daily_story_prompt"("p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."send_daily_story_prompt"("p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_daily_story_prompt"("p_force" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_review_reminders"("p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_review_reminders"("p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."send_review_reminders"("p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_review_reminders"("p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_comment_author_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_comment_author_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_comment_author_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_member_episode_permission"("p_space_id" "uuid", "p_user_id" "uuid", "p_can_create" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_member_episode_permission"("p_space_id" "uuid", "p_user_id" "uuid", "p_can_create" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_episode_permission"("p_space_id" "uuid", "p_user_id" "uuid", "p_can_create" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_review_author_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_review_author_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_review_author_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."space_members_after_change_reveal"() TO "anon";
GRANT ALL ON FUNCTION "public"."space_members_after_change_reveal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."space_members_after_change_reveal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."space_members_after_insert_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."space_members_after_insert_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."space_members_after_insert_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."space_observer_ids"("p_space_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."space_participant_ids"("p_space_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."use_invite_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."use_invite_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."use_invite_code"("p_code" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."comment_reactions" TO "anon";
GRANT ALL ON TABLE "public"."comment_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_prompt_log" TO "service_role";



GRANT ALL ON TABLE "public"."episode_comments" TO "anon";
GRANT ALL ON TABLE "public"."episode_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."episode_comments" TO "service_role";



GRANT ALL ON TABLE "public"."episode_likes" TO "anon";
GRANT ALL ON TABLE "public"."episode_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."episode_likes" TO "service_role";



GRANT ALL ON TABLE "public"."episode_media" TO "anon";
GRANT ALL ON TABLE "public"."episode_media" TO "authenticated";
GRANT ALL ON TABLE "public"."episode_media" TO "service_role";



GRANT ALL ON TABLE "public"."episodes" TO "anon";
GRANT ALL ON TABLE "public"."episodes" TO "authenticated";
GRANT ALL ON TABLE "public"."episodes" TO "service_role";



GRANT ALL ON TABLE "public"."idea_votes" TO "anon";
GRANT ALL ON TABLE "public"."idea_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."idea_votes" TO "service_role";



GRANT ALL ON TABLE "public"."ideas" TO "anon";
GRANT ALL ON TABLE "public"."ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas" TO "service_role";



GRANT ALL ON TABLE "public"."invite_codes" TO "anon";
GRANT ALL ON TABLE "public"."invite_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_codes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."review_reminder_log" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."space_members" TO "anon";
GRANT ALL ON TABLE "public"."space_members" TO "authenticated";
GRANT ALL ON TABLE "public"."space_members" TO "service_role";



GRANT ALL ON TABLE "public"."spaces" TO "anon";
GRANT ALL ON TABLE "public"."spaces" TO "authenticated";
GRANT ALL ON TABLE "public"."spaces" TO "service_role";



GRANT ALL ON TABLE "public"."synthese" TO "anon";
GRANT ALL ON TABLE "public"."synthese" TO "authenticated";
GRANT ALL ON TABLE "public"."synthese" TO "service_role";



GRANT ALL ON TABLE "public"."vote_ballots" TO "anon";
GRANT ALL ON TABLE "public"."vote_ballots" TO "authenticated";
GRANT ALL ON TABLE "public"."vote_ballots" TO "service_role";



GRANT ALL ON TABLE "public"."vote_questions" TO "anon";
GRANT ALL ON TABLE "public"."vote_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."vote_questions" TO "service_role";



GRANT ALL ON TABLE "public"."vote_results" TO "anon";
GRANT ALL ON TABLE "public"."vote_results" TO "authenticated";
GRANT ALL ON TABLE "public"."vote_results" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































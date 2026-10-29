-- « Il manque ta review » : deux relances, 1h30 d'écart
--
-- Un épisode ne s'ouvre que lorsque tout le monde a répondu (20260801040000).
-- La conséquence, quand une seule personne traîne : personne ne lit rien. Celui
-- qui a écrit sa review attend, ceux qui l'ont écrite aussi, et le seul qui
-- pourrait débloquer la situation est justement celui qui a oublié — et la
-- notification qui l'aurait prévenu date d'il y a trois heures, enterrée sous
-- le reste.
--
-- Ce fichier relance ceux qui manquent, deux fois, puis se tait.
--
--   • 1h30 après la review qui vient d'arriver → première relance
--   • 1h30 après cette relance                 → deuxième, annoncée comme la
--                                                dernière. Puis plus rien, pour
--                                                cet épisode, pour cette
--                                                personne, jamais.
--
-- L'ancre est la dernière review publiée sur l'épisode, c'est-à-dire la
-- dernière fois que la personne a reçu « X a publié sa review ». Si quelqu'un
-- d'autre répond entre-temps, l'ancre avance : on ne relance pas quelqu'un qui
-- vient d'être prévenu il y a dix minutes. Le compteur de deux, lui, n'avance
-- jamais dans l'autre sens.
--
-- ── Deux choses que « toutes les 1h30 » ne dit pas, et qu'il fallait décider ──
--
-- 1. La nuit. 1h30 après une review écrite à 23h tombe à 0h30, et le rappel
--    suivant à 2h. Une relance qui réveille est une relance qu'on désactive.
--    Les envois sont donc suspendus entre 22h et 8h (heure locale) : rien n'est
--    annulé, tout attend l'ouverture. Réglable, y compris pour supprimer la
--    pause — voir plus bas.
--
-- 2. Les vieux épisodes. Sans limite, promouvoir un observateur en participant
--    lui ferait devoir une review sur tous les épisodes jamais ouverts, et
--    deux relances pour chacun d'un coup. Seuls les épisodes dont la dernière
--    review a moins d'une semaine sont relancés : au-delà, l'affaire est close,
--    qu'elle soit finie ou non.
--
-- Ceux qui reçoivent : les participants qui n'ont pas encore publié, sur un
-- épisode non révélé où au moins une review existe. Exactement les gens à qui
-- la notification d'origine avait été envoyée, moins ceux qui ont répondu.
--
-- Pas d'interrupteur dédié, contrairement à la relance du soir : celle-ci
-- répond à un geste de quelqu'un d'autre — une review qui vient d'arriver —
-- comme les notifications d'épisode ou de commentaire. Elle suit donc le même
-- réglage qu'elles : les push du profil.
--
-- ── Réglages (table app_settings du 20260802010000) ────────────────────────
--
--   insert into public.app_settings (key, value) values
--     ('review_reminder_delay_minutes', '90'),   -- l'écart entre deux relances
--     ('review_reminder_max',           '2'),    -- combien au total, 0 = éteint
--     ('review_reminder_window_hours',  '168'),  -- au-delà, l'épisode est clos
--     ('review_reminder_quiet_start',   '22'),   -- début de la nuit
--     ('review_reminder_quiet_end',     '8')     -- fin ; égaux = pas de pause
--   on conflict (key) do update set value = excluded.value;
--
-- Le fuseau est celui de `daily_prompt_timezone` (Europe/Paris par défaut),
-- pour n'avoir qu'un seul endroit où dire où vivent les gens.
--
-- Pour l'essayer sans attendre :  select public.send_review_reminders(true);
-- Pour l'arrêter :                select cron.unschedule('review-reminders');
--
-- Dépend de 20260802000000 (notify_user, display_name) et 20260802010000
-- (app_settings). Le job tourne toutes les 10 minutes : une relance annoncée à
-- 1h30 arrive donc entre 1h30 et 1h40, ce que personne ne remarque.
-- Idempotent — peut être rejoué. À coller dans l'éditeur SQL de Supabase.

begin;

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron indisponible (%) : active-le dans Database → Extensions, sinon aucune relance ne partira', sqlerrm;
end $$;

-- ── Ce qui a déjà été relancé ──────────────────────────────────────────────
-- Une ligne par relance envoyée. C'est ce qui garantit les deux : le compte se
-- lit ici, et l'insertion précède l'envoi, donc deux exécutions simultanées ne
-- peuvent pas écrire la même ligne deux fois.
--
-- `on delete cascade` des deux côtés : un épisode supprimé emporte ses relances,
-- et le seul effet de bord acceptable serait qu'un épisode recréé reparte à
-- zéro, ce qui est le bon comportement.

create table if not exists public.review_reminder_log (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_no smallint not null,
  sent_at timestamptz not null default now(),
  primary key (episode_id, user_id, reminder_no)
);

alter table public.review_reminder_log enable row level security;
revoke all on public.review_reminder_log from anon, authenticated;

-- « Qui a écrit sur cet épisode, et quand la dernière est-elle arrivée » : deux
-- questions posées pour chaque épisode ouvert, toutes les dix minutes.
create index if not exists reviews_episode_created_idx
  on public.reviews (episode_id, created_at desc);

-- ── Le fuseau, dit à un seul endroit ───────────────────────────────────────

create or replace function public.notification_timezone()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.notification_timezone() from public;

-- Un réglage entier, avec sa valeur de repli quand il est absent, illisible ou
-- hors bornes. Un chiffre mal tapé dans app_settings ne doit pas éteindre les
-- relances en silence — il doit être ignoré, à voix haute.
create or replace function public.app_setting_int(p_key text, p_default int, p_min int, p_max int)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.app_setting_int(text, int, int, int) from public;

-- ── Les relances ───────────────────────────────────────────────────────────
/*
 * Renvoie le nombre de relances envoyées. p_force ignore la pause de la nuit
 * (pour tester) mais jamais le délai, ni le compte de deux : ces deux-là sont
 * la promesse faite à l'utilisateur.
 */
create or replace function public.send_review_reminders(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.send_review_reminders(boolean) from public;

-- ── Le réveil ──────────────────────────────────────────────────────────────
-- Toutes les dix minutes : c'est la finesse d'un rendez-vous à 1h30, et la
-- fonction ne fait rien du tout tant qu'aucune échéance n'est passée.

do $$
begin
  perform cron.unschedule('review-reminders');
exception
  when others then
    null; -- pas encore programmé, ou pg_cron absent
end $$;

do $$
begin
  perform cron.schedule(
    'review-reminders',
    '*/10 * * * *',
    $cron$select public.send_review_reminders();$cron$
  );
  raise notice 'relances de review programmées : % rappel(s), % minutes d''écart, pause de %h à %h',
    public.app_setting_int('review_reminder_max', 2, 0, 10),
    public.app_setting_int('review_reminder_delay_minutes', 90, 1, 10080),
    public.app_setting_int('review_reminder_quiet_start', 22, 0, 23),
    public.app_setting_int('review_reminder_quiet_end', 8, 0, 23);
exception
  when others then
    raise notice 'job non programmé (%) : appelle select public.send_review_reminders(); toutes les 10 minutes depuis ailleurs, ou active pg_cron', sqlerrm;
end $$;

commit;

-- 20h : « Quelque chose à raconter aujourd'hui ? »
--
-- Toutes les notifications écrites jusqu'ici répondent à un geste de quelqu'un
-- d'autre : un épisode créé, une review publiée, un commentaire. Personne n'est
-- jamais sollicité pour raconter sa propre journée — et une journée qu'on ne
-- raconte pas le soir même ne se raconte plus jamais. Ce fichier ajoute le seul
-- rendez-vous que l'app se donne à elle-même : une fois par jour, à 20h.
--
-- Qui le reçoit :
--
--   • les participants — ceux qui peuvent créer un épisode. Les observateurs
--     sont laissés tranquilles : leur proposer de raconter quelque chose serait
--     leur proposer un bouton qu'ils n'ont pas.
--   • une fois par personne et par jour, pas une fois par espace : quelqu'un qui
--     suit trois aventures a une seule journée à raconter.
--   • sauf s'il a déjà créé un épisode dans la journée. On ne demande pas à
--     quelqu'un s'il a quelque chose à raconter alors qu'il vient de le faire.
--   • sauf s'il a coupé la relance dans son profil. C'est la seule notification
--     que l'app envoie sans que personne ne l'ait provoquée — la seule, donc,
--     qui a besoin d'un interrupteur à elle : couper les push coupe aussi les
--     réponses à ses commentaires, ce qui n'est pas ce qu'on veut quand on veut
--     juste qu'on lui fiche la paix à 20h. L'interrupteur est
--     `profiles.daily_prompt_enabled`, allumé par défaut.
--
-- Où mène la notification : directement sur la création d'épisode quand la
-- personne n'a qu'une aventure — le cas de presque tout le monde. Sinon sur
-- l'accueil, parce qu'il faut bien choisir laquelle.
--
-- ── Comment 20h est tenu ───────────────────────────────────────────────────
--
-- pg_cron compte en UTC ; 20h à Paris ne l'est pas, et se déplace deux fois par
-- an. Plutôt que d'inscrire une heure UTC qui serait fausse la moitié de
-- l'année, le job tourne toutes les heures et la fonction regarde l'heure
-- locale avant de faire quoi que ce soit : 23 réveils par jour qui repartent
-- immédiatement, et un qui envoie. Le changement d'heure ne demande rien à
-- personne.
--
-- L'envoi ne peut pas être fait deux fois : `daily_prompt_log` garde une ligne
-- par personne et par jour local, et c'est l'insertion de cette ligne qui donne
-- le droit d'écrire la notification. Un job rejoué, deux workers en même temps,
-- une heure qui repasse à 2h du matin en octobre : une seule notification.
--
-- Réglable sans toucher au SQL, via `app_settings` (table du 20260802010000) :
--
--   insert into public.app_settings (key, value) values
--     ('daily_prompt_hour', '20'),               -- 0–23, heure locale
--     ('daily_prompt_timezone', 'Europe/Paris')
--   on conflict (key) do update set value = excluded.value;
--
-- Pour l'essayer tout de suite, sans attendre 20h :
--
--   select public.send_daily_story_prompt(true);   -- renvoie le nombre d'envois
--   delete from public.daily_prompt_log where prompt_date = current_date; -- rejouer
--
-- Pour l'arrêter :  select cron.unschedule('daily-story-prompt');
--
-- Dépend de 20260802000000 (notify_user) et 20260802010000 (app_settings). Les
-- notifications partent en push par le trigger du 20260802010000, comme les
-- autres, sans rien de spécifique ici.
-- Idempotent — peut être rejoué. À coller dans l'éditeur SQL de Supabase.

begin;

-- ── pg_cron ────────────────────────────────────────────────────────────────
-- Supabase le fournit. Enveloppé comme pg_net l'était : un projet qui ne peut
-- pas l'installer doit quand même récupérer la table et la fonction ci-dessous,
-- quitte à appeler celle-ci depuis ailleurs.

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron indisponible (%) : active-le dans Database → Extensions, sinon la relance du soir ne partira pas', sqlerrm;
end $$;

-- ── L'interrupteur ─────────────────────────────────────────────────────────
-- Sur le profil plutôt que dans une table de préférences : c'est un booléen par
-- personne, l'app lit déjà sa ligne de `profiles` au démarrage et sait la
-- modifier. Une table de plus pour une case à cocher serait une jointure de
-- plus à chaque envoi.
--
-- `not null default true` : tous ceux qui existent déjà l'ont allumé sans rien
-- faire, et une ligne créée demain aussi. Se taire est un choix qu'on fait, pas
-- un état par défaut.

alter table public.profiles
  add column if not exists daily_prompt_enabled boolean not null default true;

comment on column public.profiles.daily_prompt_enabled is
  'Reçoit la relance quotidienne « Quelque chose à raconter aujourd''hui ? ». Réglé depuis l''écran Profil.';

-- ── Ce qui a déjà été envoyé ───────────────────────────────────────────────
-- La clé primaire est la garantie : (personne, jour local) n'existe qu'une fois.
-- RLS active et aucune policy, comme app_settings — c'est une table de service,
-- aucun client n'a de raison de la lire.

create table if not exists public.daily_prompt_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, prompt_date)
);

alter table public.daily_prompt_log enable row level security;
revoke all on public.daily_prompt_log from anon, authenticated;

-- « A-t-il créé un épisode aujourd'hui ? », posée une fois par personne chaque
-- soir, mérite de ne pas parcourir toute la table.
create index if not exists episodes_creator_created_idx
  on public.episodes (created_by, created_at desc);

-- ── La relance ─────────────────────────────────────────────────────────────
/*
 * Ne fait rien sauf à l'heure dite, et renvoie le nombre de notifications
 * écrites — de quoi vérifier d'un coup d'œil dans cron.job_run_details.
 *
 * p_force ignore l'horloge (pour tester), jamais le journal : deux appels de
 * suite le même jour n'envoient qu'une notification.
 */
create or replace function public.send_daily_story_prompt(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
    where
      -- L'interrupteur du profil. Une personne sans ligne de profil est traitée
      -- comme quelqu'un qui n'a rien coupé : l'absence n'est pas un refus.
      coalesce(
        (select pr.daily_prompt_enabled from public.profiles pr where pr.id = p.user_id),
        true
      )
      and not exists (
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

-- Personne d'autre que le job (et le service role) n'a à déclencher ça.
revoke all on function public.send_daily_story_prompt(boolean) from public;

-- ── Le rendez-vous ─────────────────────────────────────────────────────────
-- Toutes les heures ; la fonction ne retient que celle du soir. Voir l'en-tête.

do $$
begin
  perform cron.unschedule('daily-story-prompt');
exception
  when others then
    null; -- pas encore programmé, ou pg_cron absent
end $$;

do $$
begin
  perform cron.schedule(
    'daily-story-prompt',
    '0 * * * *',
    $cron$select public.send_daily_story_prompt();$cron$
  );
  raise notice 'relance du soir programmée : « Quelque chose à raconter aujourd''hui ? » à %h, fuseau %',
    coalesce(nullif(btrim(public.app_setting('daily_prompt_hour')), ''), '20'),
    coalesce(nullif(btrim(public.app_setting('daily_prompt_timezone')), ''), 'Europe/Paris');
exception
  when others then
    raise notice 'job non programmé (%) : appelle select public.send_daily_story_prompt(); toutes les heures depuis ailleurs, ou active pg_cron', sqlerrm;
end $$;

commit;

-- From a row in `notifications` to a phone that buzzes
--
-- 20260802000000 made the database write down what happened, for whom. That
-- fills the bell inside the app, and stops there: a row in a table does not
-- reach a device that is not currently looking at it. This file is the wire.
--
-- Every insert into `notifications` POSTs the new row to the `send-push` Edge
-- Function, which encrypts it for each of that user's registered devices — a
-- browser subscription for the PWA deployed on Vercel, an Expo token for a
-- native build. See supabase/functions/send-push/index.ts.
--
-- The call is made with pg_net, which queues the request and hands it to a
-- background worker: the HTTP round-trip never happens inside the transaction
-- that created the notification, so a slow push service cannot slow down
-- somebody writing a review.
--
-- Two settings have to exist for any of this to fire — the function's URL and
-- the shared secret it authenticates callers with. They live in `app_settings`,
-- a table no client can read. Without them the trigger does nothing at all,
-- quietly: the in-app list keeps working, only the buzzing stops.
--
--   insert into public.app_settings (key, value) values
--     ('push_function_url', 'https://<ref>.supabase.co/functions/v1/send-push'),
--     ('push_webhook_secret', '<le même secret que PUSH_WEBHOOK_SECRET>')
--   on conflict (key) do update set value = excluded.value;
--
-- Full deployment steps: supabase/functions/send-push/README.md
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- ── pg_net ─────────────────────────────────────────────────────────────────
-- Supabase ships it; enabling it here means one less checkbox to remember.
-- Wrapped because a project that cannot install it should still get the tables
-- and policies below — the trigger then fails one notification at a time,
-- loudly, instead of the whole file refusing to run.

do $$
begin
  create extension if not exists pg_net;
exception
  when others then
    raise notice 'pg_net indisponible (%) : active-le dans Database → Extensions, sinon aucun push ne partira', sqlerrm;
end $$;

-- ── Where the settings live ────────────────────────────────────────────────
-- RLS on and deliberately no policy: `authenticated` and `anon` can read
-- nothing from this table, whatever else changes. Only the trigger below, which
-- runs as the table owner, and the service role, ever see the secret.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
  loop
    execute format('drop policy %I on public.app_settings', pol.policyname);
    raise notice 'ancienne policy % supprimée sur app_settings', pol.policyname;
  end loop;
end $$;

revoke all on public.app_settings from anon, authenticated;

create or replace function public.app_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key;
$$;

revoke all on function public.app_setting(text) from public;

-- ── Devices ────────────────────────────────────────────────────────────────
-- The table the app writes its subscription into, and the sender reads.
-- `endpoint` holds either an https:// browser endpoint (with p256dh/auth
-- filled) or an Expo token (with them empty) — the sender tells them apart by
-- shape. Created here rather than assumed for the same reason as
-- `notifications`: a silent failure to store a subscription looks exactly like
-- a user who never enabled push.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();

-- One row per device. Without this, every sign-in on a browser that kept its
-- subscription would add a duplicate and the user would get each notification
-- twice, three times, four…
do $$
begin
  create unique index push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
exception
  when duplicate_table then null;
  when unique_violation then
    raise notice 'des endpoints en double existent déjà : index unique non créé (les doublons enverront des notifications en double)';
end $$;

alter table public.push_subscriptions enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions'
  loop
    execute format('drop policy %I on public.push_subscriptions', pol.policyname);
    raise notice 'ancienne policy % (%) supprimée sur push_subscriptions', pol.policyname, pol.cmd;
  end loop;
end $$;

-- A device belongs to the person holding it. Nobody reads anybody else's
-- endpoints: they are addresses you can push to.
create policy "push subscriptions: your own devices"
on public.push_subscriptions for select
to authenticated
using (user_id = auth.uid());

create policy "push subscriptions: register your own device"
on public.push_subscriptions for insert
to authenticated
with check (user_id = auth.uid());

create policy "push subscriptions: forget your own device"
on public.push_subscriptions for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- ── The wire ───────────────────────────────────────────────────────────────

create or replace function public.notifications_after_insert_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists notifications_send_push on public.notifications;
create trigger notifications_send_push
after insert on public.notifications
for each row
execute function public.notifications_after_insert_push();

-- Say out loud whether this will actually do anything, while somebody is
-- reading the output of the paste.
do $$
begin
  if public.app_setting('push_function_url') is null or public.app_setting('push_webhook_secret') is null then
    raise notice 'push non configuré : renseigne push_function_url et push_webhook_secret dans app_settings (voir l''en-tête de ce fichier). Les notifications in-app fonctionnent déjà.';
  else
    raise notice 'push configuré : les notifications seront envoyées à %', public.app_setting('push_function_url');
  end if;
end $$;

commit;

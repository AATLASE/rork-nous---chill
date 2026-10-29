-- Lot 4a: a push endpoint belongs to whoever registered it last (review BUG-5).
--
-- push_subscriptions has a unique index on endpoint alone (one browser or
-- phone = one endpoint), but RLS only lets a user see and insert their own
-- rows. When account B signed in on a browser account A had used without
-- signing out, B's insert hit the unique index, the client swallowed the
-- error, and the device kept receiving A's notifications.
--
-- This function moves the endpoint to the caller instead. It is the only way
-- the apps register a device from now on.

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) returns void
  language plpgsql security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'Endpoint manquant.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end $$;

-- Default privileges no longer grant EXECUTE (see 20261029030000).
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

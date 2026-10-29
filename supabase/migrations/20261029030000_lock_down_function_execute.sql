-- Lock down who can call functions in the public schema (review SEC-1).
--
-- Supabase grants EXECUTE on every new function directly to anon and
-- authenticated, and earlier migrations only ran `revoke ... from public`,
-- which does not remove those direct grants. So every SECURITY DEFINER
-- function was callable through /rest/v1/rpc with the public anon key,
-- including:
--   - mcp_execute_sql(jsonb, text): runs arbitrary SQL as its owner
--   - app_setting(text): returns the push webhook secret
--   - notify_user / notify_space: forge notifications and pushes
--
-- After this migration:
--   - nobody but the owner (and service_role) can execute functions by default;
--   - authenticated keeps EXECUTE only on the two RPCs the apps call and on
--     the helpers used inside RLS policies (policies run as the caller).
-- Trigger functions and functions called from other SECURITY DEFINER
-- functions or from pg_cron run with their owner's rights and need nothing.
--
-- New functions: default privileges are revoked too, so a function meant to be
-- called from the app needs an explicit `grant execute ... to authenticated`.

revoke execute on all functions in schema public from public, anon, authenticated;

-- RPCs called by the Expo and iOS apps
grant execute on function public.join_space_with_code(text) to authenticated;
grant execute on function public.episode_review_authors(uuid) to authenticated;

-- Helpers referenced by RLS policies (public tables and storage.objects)
grant execute on function public.can_review_in_space(uuid) to authenticated;
grant execute on function public.episode_is_revealed(uuid) to authenticated;
grant execute on function public.episode_reviews_visible(uuid) to authenticated;
grant execute on function public.episode_space_id(uuid) to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;
grant execute on function public.my_is_contributor(uuid) to authenticated;
grant execute on function public.my_space_role(uuid) to authenticated;
grant execute on function public.owns_space_media_path(text) to authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

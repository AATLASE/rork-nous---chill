-- Rollback of 20261029060000_register_push_subscription.sql
-- The previous app version inserted directly; it still works without this function.
drop function if exists public.register_push_subscription(text, text, text);

-- Rollback of 20261029050000_freeze_keys_and_safe_reveal.sql
drop trigger if exists episode_comments_freeze_keys on public.episode_comments;
drop trigger if exists reviews_freeze_keys on public.reviews;
drop trigger if exists reviews_fill_space_id on public.reviews;
drop trigger if exists episodes_keep_reveal_stamp on public.episodes;
drop function if exists public.episode_comments_freeze_keys();
drop function if exists public.reviews_freeze_keys();
drop function if exists public.reviews_fill_space_id();
drop function if exists public.episodes_keep_reveal_stamp();
-- reveal_episode_reviews_if_complete: the previous body is identical minus the
-- `for update` on the first select; leaving the lock in place is harmless.

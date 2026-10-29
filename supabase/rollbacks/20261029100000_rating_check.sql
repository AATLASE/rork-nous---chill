-- Rollback of 20261029100000_rating_check.sql
alter table public.reviews drop constraint if exists reviews_rating_range;

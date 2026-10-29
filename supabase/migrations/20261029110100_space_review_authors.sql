-- Lot 5bis (HIE-2): who has written on which episode, for the whole space at once.
--
-- The home screen marks each episode "À toi" or "3/4". episode_review_authors
-- answers that for one episode; calling it per card would be one request per
-- episode. Same rule: ids only (the reviews stay sealed), members only.

create or replace function public.space_review_authors(p_space_id uuid)
  returns table (episode_id uuid, author_id uuid)
  language sql stable security definer
  set search_path = public
as $$
  select r.episode_id, r.author_id
  from public.reviews r
  join public.episodes e on e.id = r.episode_id
  where e.space_id = p_space_id
    and exists (
      select 1
      from public.space_members m
      where m.space_id = p_space_id
        and m.user_id = auth.uid()
    );
$$;

-- Default privileges no longer grant EXECUTE (lot 1): the app needs it explicitly.
revoke all on function public.space_review_authors(uuid) from public, anon;
grant execute on function public.space_review_authors(uuid) to authenticated;

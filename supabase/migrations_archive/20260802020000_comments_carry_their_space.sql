-- A comment already knows which space it is in
--
-- `episode_comments.space_id` is NOT NULL, and the app never sent it: posting a
-- comment failed with "null value in column space_id violates not-null
-- constraint". The column is not wrong — it is what makes a space-wide read
-- cheap — but it is redundant information: a comment belongs to an episode, and
-- an episode belongs to exactly one space. Asking the client for it is asking it
-- to repeat something the database already knows, and to be right about it.
--
-- So the database fills it in. The client sends it too now (useSocial.ts), and
-- this trigger only steps in when it is missing — which also covers the browser
-- tabs still running the previous build, and anything else that talks to the
-- API.
--
-- `space_id` is deliberately overwritten rather than trusted when it disagrees
-- with the episode: a comment in space A on an episode of space B is not a
-- thing, and letting a client assert it would be a hole in every "members of
-- the space read this" policy that joins on it.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

create or replace function public.episode_comments_fill_space_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists episode_comments_set_space_id on public.episode_comments;
create trigger episode_comments_set_space_id
before insert or update of episode_id on public.episode_comments
for each row
execute function public.episode_comments_fill_space_id();

-- Older comments written before the column existed, if any survived.
update public.episode_comments c
set space_id = e.space_id
from public.episodes e
where e.id = c.episode_id and c.space_id is distinct from e.space_id;

commit;

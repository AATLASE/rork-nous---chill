-- Photos and videos on episodes
--
-- Symptom: a space cover uploads fine, but adding an image to an episode fails —
-- and when it happens while creating the episode, the whole episode disappears
-- (the client used to roll the row back when an upload threw).
--
-- The `episode-media` bucket exists and is public, so reading works: asking for
-- a missing object answers `NoSuchKey`, not `NoSuchBucket`. What is missing is
-- any policy granting INSERT on `storage.objects`, and RLS denies by default —
-- so every upload is refused. Covers and avatars hide it, because for small
-- images the client falls back to an inline data URL; episode media has no such
-- fallback (a video cannot be inlined), so there it surfaces as a plain failure.
--
-- The rule: a signed-in member of a space may write inside a folder named after
-- that space. `storage.foldername(name)` returns the path segments, so every
-- layout the client tries ("episodes/{space}/…", "{user}/{space}/…",
-- "{space}/{episode}/…") is accepted as soon as one segment is a space the
-- uploader belongs to. Segments are compared as text on purpose: casting one to
-- uuid would error on the segments that are not (e.g. "episodes").
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- SECURITY DEFINER for the same reason as join_space_with_code: the check reads
-- `space_members`, which is itself behind RLS. Evaluated as the caller, a
-- restrictive membership policy would silently make every upload fail again.
-- It answers one question about the caller alone — "is this path in one of my
-- spaces?" — so it reveals nothing the caller cannot already see.
create or replace function public.owns_space_media_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members m
    where m.user_id = auth.uid()
      and m.space_id::text = any (storage.foldername(p_name))
  );
$$;

revoke all on function public.owns_space_media_path(text) from public;
grant execute on function public.owns_space_media_path(text) to authenticated;

-- Reads already work through the public URL; this only covers the authenticated
-- storage API (list, move, signed URLs), which RLS would otherwise deny.
drop policy if exists "episode-media: members read" on storage.objects;
create policy "episode-media: members read"
on storage.objects for select
to authenticated
using (bucket_id = 'episode-media' and public.owns_space_media_path(name));

drop policy if exists "episode-media: members upload" on storage.objects;
create policy "episode-media: members upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'episode-media' and public.owns_space_media_path(name));

-- Replacing an object (a retry after a partial failure lands here) follows the
-- same membership rule.
drop policy if exists "episode-media: members replace" on storage.objects;
create policy "episode-media: members replace"
on storage.objects for update
to authenticated
using (bucket_id = 'episode-media' and public.owns_space_media_path(name))
with check (bucket_id = 'episode-media' and public.owns_space_media_path(name));

-- Deleting is narrower than writing: whoever uploaded the file, or the owner of
-- the space it belongs to. A member cannot wipe someone else's photos.
drop policy if exists "episode-media: uploader or space owner deletes" on storage.objects;
create policy "episode-media: uploader or space owner deletes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'episode-media'
  and (
    owner = auth.uid()
    or exists (
      select 1
      from public.space_members m
      where m.user_id = auth.uid()
        and m.role = 'owner'
        and m.space_id::text = any (storage.foldername(name))
    )
  )
);

commit;

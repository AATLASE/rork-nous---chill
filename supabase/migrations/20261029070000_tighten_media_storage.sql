-- Lot 4c: tighten the episode-media bucket rules (review SEC-9, plus a policy
-- found while versioning the prod schema).
--
-- 1. "episode_media_storage_read" applied to every role, signed in or not, so
--    anyone holding the public anon key could list the whole bucket through the
--    storage API and enumerate every photo of every space. The app never lists
--    or downloads through the API: it shows files by their public URL, which
--    the bucket being public keeps working. Members keep API read access through
--    "episode-media: members read".
--
-- 2. owns_space_media_path accepted a space id in ANY folder of the path, so a
--    member of space A could write under another space's prefix as long as A's
--    id appeared somewhere in it. The space is now always the first folder,
--    which is the layout the app writes ("<spaceId>/<episodeId>/…",
--    "<spaceId>/covers/…"). Older uploads stored under "<userId>/<spaceId>/…"
--    stay readable by URL and deletable by their uploader; a client that still
--    has that layout cached falls through to the next candidate and caches it.
--
-- 3. The bucket had no limits. 50 MB matches the per-file storage limit and the
--    app's own check on videos; only images and videos are accepted.

drop policy if exists "episode_media_storage_read" on storage.objects;

create or replace function public.owns_space_media_path(p_name text) returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.space_members m
    where m.user_id = auth.uid()
      and m.space_id::text = (storage.foldername(p_name))[1]
  );
$$;

update storage.buckets
set file_size_limit = 50 * 1024 * 1024,
    allowed_mime_types = array['image/*', 'video/*']
where id = 'episode-media';

-- Rollback of 20261029070000_tighten_media_storage.sql (restores the previous, looser rules)
create policy "episode_media_storage_read" on storage.objects for select using (bucket_id = 'episode-media');

create or replace function public.owns_space_media_path(p_name text) returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.space_members m
    where m.user_id = auth.uid() and m.space_id::text = any (storage.foldername(p_name))
  );
$$;

update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'episode-media';

-- Baseline, part 2: storage bucket and storage.objects policies as they exist
-- in production on 2026-10-29 (pulled with `supabase db dump --schema storage`).
-- Part 1 (20261029013924_remote_schema.sql) only covers the public schema.
-- Copied as-is so the repo reproduces prod; tightening them is a later lot
-- (note: "episode_media_storage_read" has no role, so anyone can read the bucket).

insert into storage.buckets (id, name, public)
values ('episode-media', 'episode-media', true)
on conflict (id) do nothing;

DROP POLICY IF EXISTS "episode-media: members read" ON "storage"."objects";
CREATE POLICY "episode-media: members read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'episode-media'::"text") AND "public"."owns_space_media_path"("name")));
DROP POLICY IF EXISTS "episode-media: members replace" ON "storage"."objects";
CREATE POLICY "episode-media: members replace" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'episode-media'::"text") AND "public"."owns_space_media_path"("name"))) WITH CHECK ((("bucket_id" = 'episode-media'::"text") AND "public"."owns_space_media_path"("name")));
DROP POLICY IF EXISTS "episode-media: members upload" ON "storage"."objects";
CREATE POLICY "episode-media: members upload" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'episode-media'::"text") AND "public"."owns_space_media_path"("name")));
DROP POLICY IF EXISTS "episode-media: uploader or space owner deletes" ON "storage"."objects";
CREATE POLICY "episode-media: uploader or space owner deletes" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'episode-media'::"text") AND (("owner" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."space_members" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."role" = 'owner'::"text") AND (("m"."space_id")::"text" = ANY ("storage"."foldername"("objects"."name")))))))));
DROP POLICY IF EXISTS "episode_media_storage_delete" ON "storage"."objects";
CREATE POLICY "episode_media_storage_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'episode-media'::"text") AND ("owner" = "auth"."uid"())));
DROP POLICY IF EXISTS "episode_media_storage_read" ON "storage"."objects";
CREATE POLICY "episode_media_storage_read" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'episode-media'::"text"));
DROP POLICY IF EXISTS "episode_media_storage_write" ON "storage"."objects";
CREATE POLICY "episode_media_storage_write" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'episode-media'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."space_members" "sm"
  WHERE (("sm"."space_id" = (("storage"."foldername"("objects"."name"))[1])::"uuid") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))))));

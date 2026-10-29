import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/keys";
import { getProfilesMap } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import type { Review } from "@/lib/types";
import { useAuth } from "@/providers/auth";

export interface ReviewValues {
  rating: number | null;
  favorite_moment: string | null;
  awkward_moment: string | null;
  funny_quote: string | null;
  summary: string | null;
  song: string | null;
}

/**
 * All reviews the backend exposes for an episode: your own always, everyone
 * else's once the episode is revealed — that is, once every participant has
 * published theirs (or the owner force-unlocked the season). Before that, RLS
 * returns a single row, so this list is not a way to know who has answered.
 */
export function useEpisodeReviews(episodeId: string) {
  return useQuery({
    queryKey: qk.reviews(episodeId),
    enabled: !!episodeId,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const reviews = (data ?? []) as Review[];
      const profiles = await getProfilesMap(reviews.map((r) => r.author_id));
      return reviews.map((r) => ({ ...r, profile: profiles[r.author_id] ?? null }));
    },
  });
}

/**
 * Who has already published for this episode — ids only, no content. The whole
 * point of the seal is that the reviews themselves stay unreadable until the
 * last one lands, so "qui a déjà répondu" cannot be derived from the rows the
 * caller is allowed to select; the database answers it through a function.
 */
export function useEpisodeReviewAuthors(episodeId: string) {
  return useQuery({
    queryKey: qk.reviewAuthors(episodeId),
    enabled: !!episodeId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("episode_review_authors", { p_episode_id: episodeId });
      if (error) throw error;
      return ((data ?? []) as { author_id: string }[]).map((r) => r.author_id);
    },
  });
}

/**
 * The same, for every episode of a space in one call: the home cards say
 * "À toi" or "3/4" without opening each episode. Episode id → author ids.
 */
export function useSpaceReviewAuthors(spaceId: string) {
  return useQuery({
    queryKey: qk.spaceReviewAuthors(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase.rpc("space_review_authors", { p_space_id: spaceId });
      if (error) throw error;
      const byEpisode = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const set = byEpisode.get(row.episode_id) ?? new Set<string>();
        set.add(row.author_id);
        byEpisode.set(row.episode_id, set);
      }
      return byEpisode;
    },
  });
}

export function useMyReview(episodeId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.myReview(episodeId, userId),
    enabled: !!episodeId && !!userId,
    queryFn: async (): Promise<Review | null> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("episode_id", episodeId)
        .eq("author_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as Review | null) ?? null;
    },
  });
}

interface UpsertReviewInput {
  episodeId: string;
  spaceId: string;
  values: ReviewValues;
}

export function useUpsertReview() {
  const { userId, profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ episodeId, spaceId, values }: UpsertReviewInput): Promise<Review> => {
      const updateMine = async () => {
        const { data, error } = await supabase
          .from("reviews")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("episode_id", episodeId)
          .eq("author_id", userId as string)
          .select("*")
          .single();
        if (error) throw error;
        return data as Review;
      };

      const { data: existing, error: lookupError } = await supabase
        .from("reviews")
        .select("id")
        .eq("episode_id", episodeId)
        .eq("author_id", userId as string)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return updateMine();

      const { data, error } = await supabase
        .from("reviews")
        // "author_name" is NOT NULL: snapshot the profile name at write time.
        .insert({ episode_id: episodeId, author_id: userId, space_id: spaceId, author_name: profile?.name ?? "Membre", ...values })
        .select("*")
        .single();
      // A double tap sends two inserts; the database keeps one review per
      // author and episode (unique constraint), so the second becomes an edit.
      if (error?.code === "23505") return updateMine();
      if (error) throw error;
      return data as Review;
    },
    onSuccess: (_review, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.reviews(variables.episodeId) });
      queryClient.invalidateQueries({ queryKey: qk.myReview(variables.episodeId, userId) });
      queryClient.invalidateQueries({ queryKey: qk.reviewAuthors(variables.episodeId) });
      // This review may have been the last one missing, in which case the
      // database just stamped `reviews_revealed_at` on the episode — refetch it
      // so the screen opens on the reveal instead of the sealed card.
      queryClient.invalidateQueries({ queryKey: qk.episode(variables.episodeId) });
      queryClient.invalidateQueries({ queryKey: qk.episodes(variables.spaceId) });
      queryClient.invalidateQueries({ queryKey: qk.spaceReviewAuthors(variables.spaceId) });
    },
  });
}

/**
 * The space owner reveals one episode without waiting for a participant who
 * will never write (supabase/migrations/20261029090000_reliability.sql).
 */
export function useRevealEpisodeNow(episodeId: string, spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc("reveal_episode_now", { p_episode_id: episodeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.episode(episodeId) });
      queryClient.invalidateQueries({ queryKey: qk.episodes(spaceId) });
      queryClient.invalidateQueries({ queryKey: qk.reviews(episodeId) });
    },
  });
}

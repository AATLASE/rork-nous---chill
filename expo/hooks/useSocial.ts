import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/keys";
import { getProfilesMap } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import type { CommentReaction, EpisodeComment, Idea, IdeaVote } from "@/lib/types";
import { useAuth } from "@/providers/auth";

/* ----------------------------- Comments ----------------------------- */

export function useComments(episodeId: string) {
  return useQuery({
    queryKey: qk.comments(episodeId),
    enabled: !!episodeId,
    queryFn: async (): Promise<EpisodeComment[]> => {
      const { data, error } = await supabase
        .from("episode_comments")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const comments = (data ?? []) as EpisodeComment[];

      const commentIds = comments.map((c) => c.id);
      let reactions: CommentReaction[] = [];
      if (commentIds.length > 0) {
        const { data: reactionData } = await supabase
          .from("comment_reactions")
          .select("*")
          .in("comment_id", commentIds);
        reactions = (reactionData ?? []) as CommentReaction[];
      }

      const profiles = await getProfilesMap(comments.map((c) => c.author_id));
      const hydrated = comments.map((c) => ({
        ...c,
        profile: profiles[c.author_id] ?? null,
        reactions: reactions.filter((r) => r.comment_id === c.id),
        replies: [] as EpisodeComment[],
      }));

      /* One level deep, like every comment thread people already know: roots in
         chronological order, each answer under the comment it answers. A reply
         whose parent is gone (deleted between the two reads) is shown as a root
         rather than dropped — the words were written, they stay. */
      const byId = new Map(hydrated.map((c) => [c.id, c]));
      const roots: EpisodeComment[] = [];
      for (const comment of hydrated) {
        const parent = comment.parent_id ? byId.get(comment.parent_id) : undefined;
        if (parent && parent.id !== comment.id) parent.replies?.push(comment);
        else roots.push(comment);
      }
      return roots;
    },
  });
}

/**
 * `space_id` is NOT NULL on `episode_comments` even though it is derivable from
 * the episode — same shape as `reviews`. Sending it is the caller's job here,
 * and a trigger fills it in for anyone who forgets (20260802020000).
 */
export interface NewComment {
  body: string;
  /** The comment being answered, if any. Nesting deeper than one level is
   *  flattened onto the root by the database — see 20260803010000. */
  parentId?: string | null;
  /** Ids named with "@" in the body; the database notifies them. */
  mentions?: string[];
}

export function useAddComment(episodeId: string, spaceId?: string | null) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, parentId, mentions }: NewComment): Promise<void> => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Le commentaire est vide.");
      const { error } = await supabase.from("episode_comments").insert({
        episode_id: episodeId,
        author_id: userId,
        space_id: spaceId || null,
        body: trimmed,
        parent_id: parentId || null,
        mentions: mentions && mentions.length > 0 ? mentions : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.comments(episodeId) });
    },
  });
}

export function useDeleteComment(episodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string): Promise<void> => {
      const { error } = await supabase.from("episode_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.comments(episodeId) });
    },
  });
}

export function useToggleReaction(episodeId: string) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, emoji, active }: { commentId: string; emoji: string; active: boolean }): Promise<void> => {
      if (active) {
        const { error } = await supabase
          .from("comment_reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", userId as string)
          .eq("emoji", emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comment_reactions")
          .insert({ comment_id: commentId, user_id: userId, emoji });
        // Already there (a double tap, or another device): that is the state we wanted.
        if (error && error.code !== "23505") throw error;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.comments(episodeId) });
    },
  });
}

/* ------------------------------ Ideas ------------------------------- */

export function useIdeas(spaceId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.ideas(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<(Idea & { voteCount: number; voted: boolean })[]> => {
      const { data, error } = await supabase
        .from("ideas")
        .select("*")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ideas = (data ?? []) as Idea[];

      const ideaIds = ideas.map((i) => i.id);
      let votes: IdeaVote[] = [];
      if (ideaIds.length > 0) {
        const { data: voteData } = await supabase.from("idea_votes").select("*").in("idea_id", ideaIds);
        votes = (voteData ?? []) as IdeaVote[];
      }

      const profiles = await getProfilesMap(ideas.map((i) => i.proposed_by));
      return ideas.map((idea) => {
        const ideaVotes = votes.filter((v) => v.idea_id === idea.id);
        return {
          ...idea,
          profile: profiles[idea.proposed_by ?? ""] ?? null,
          voteCount: ideaVotes.length,
          voted: userId ? ideaVotes.some((v) => v.user_id === userId) : false,
        };
      });
    },
  });
}

export function useCreateIdea(spaceId: string) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, description }: { title: string; description: string }): Promise<void> => {
      const { error } = await supabase.from("ideas").insert({
        space_id: spaceId,
        title: title.trim(),
        description: description.trim() || null,
        status: "open",
        proposed_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.ideas(spaceId) });
    },
  });
}

export function useToggleIdeaVote(spaceId: string) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ideaId, voted }: { ideaId: string; voted: boolean }): Promise<void> => {
      if (voted) {
        const { error } = await supabase
          .from("idea_votes")
          .delete()
          .eq("idea_id", ideaId)
          .eq("user_id", userId as string);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("idea_votes").insert({ idea_id: ideaId, user_id: userId });
        // Already there (a double tap, or another device): that is the state we wanted.
        if (error && error.code !== "23505") throw error;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.ideas(spaceId) });
    },
  });
}

export function useDeleteIdea(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ideaId: string): Promise<void> => {
      const { error } = await supabase.from("ideas").delete().eq("id", ideaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.ideas(spaceId) });
    },
  });
}

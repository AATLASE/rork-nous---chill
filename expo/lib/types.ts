/** Domain types mirroring the existing "Gather" Supabase schema. */

export type MemberRole = "owner" | "member" | "observer";

export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Receives the 8pm "anything to tell today?" reminder. Optional here rather
   * than required: the column arrives with 20260806000000, and a client running
   * against a database without it yet must read as "on", like everybody else.
   */
  daily_prompt_enabled?: boolean;
}

export interface Space {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_by: string;
  season_start: string | null;
  season_end: string | null;
  season_unlocked: boolean;
  created_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: MemberRole;
  can_create_episodes: boolean;
  joined_at: string;
  profile?: Profile | null;
}

/**
 * The single permanent invite code of a space (one row per space). Anyone with
 * the code joins as an observer; regenerating it invalidates the previous one.
 */
/** "member" is the participant code: who joins with it creates episodes and writes reviews. */
export type InviteRole = "observer" | "member";

export interface InviteCode {
  id: string;
  code: string;
  space_id: string;
  role: InviteRole;
  use_count: number;
  created_by: string;
  created_at: string;
}

export interface Episode {
  id: string;
  space_id: string;
  title: string;
  date: string | null;
  place: string | null;
  duration: string | number | null;
  tags: string[] | null;
  cover_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /**
   * When the last participant published their review — the moment everyone's
   * reviews became readable. Null while at least one is still missing. Set by
   * the database, never by the app.
   */
  reviews_revealed_at: string | null;
  media?: EpisodeMedia[];
  media_count?: number;
}

export interface EpisodeMedia {
  id: string;
  episode_id: string;
  url: string;
  type: string | null;
  created_at: string;
}

export interface EpisodeLike {
  id: string;
  episode_id: string;
  user_id: string;
  created_at: string;
}

export interface Review {
  id: string;
  episode_id: string;
  author_id: string;
  space_id: string | null;
  rating: number | null;
  favorite_moment: string | null;
  awkward_moment: string | null;
  funny_quote: string | null;
  summary: string | null;
  song: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
}

export interface EpisodeComment {
  id: string;
  episode_id: string;
  author_id: string;
  body: string;
  created_at: string;
  /** The comment this one answers. Threads are one level deep — a reply to a
   *  reply is flattened onto the same root, by the database. */
  parent_id?: string | null;
  /** Ids of the people named with "@" in the body (see lib/mentions.ts). */
  mentions?: string[] | null;
  profile?: Profile | null;
  reactions?: CommentReaction[];
  /** Attached client-side, oldest first. Only roots carry replies. */
  replies?: EpisodeComment[];
}

export interface CommentReaction {
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Idea {
  id: string;
  space_id: string;
  title: string;
  description: string | null;
  status: string | null;
  proposed_by: string | null;
  created_at: string;
  profile?: Profile | null;
  votes?: IdeaVote[];
}

export interface IdeaVote {
  idea_id: string;
  user_id: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  space_id: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Synthese {
  id: string;
  space_id: string;
  video_url: string | null;
  content?: string | null;
  [key: string]: unknown;
}

/** A space joined with the current user's membership row. */
export interface SpaceWithMembership extends Space {
  membership: SpaceMember;
  member_count?: number;
}

/** Whether the current user can actively participate (write) in a space. */
export function canParticipate(member: Pick<SpaceMember, "role" | "can_create_episodes"> | null | undefined): boolean {
  if (!member) return false;
  if (member.role === "owner") return true;
  if (member.role === "member" && member.can_create_episodes) return true;
  return false;
}

export function isOwner(member: Pick<SpaceMember, "role"> | null | undefined): boolean {
  return member?.role === "owner";
}

/**
 * Who has to write a review before an episode reveals: the owner and the
 * members allowed to create episodes. The database applies the same rule
 * (reveal_episode_reviews_if_complete, space_participant_ids).
 */
export function reviewersOf<M extends Pick<SpaceMember, "role" | "can_create_episodes">>(members: M[] | null | undefined): M[] {
  return (members ?? []).filter((m) => m.role === "owner" || (m.role === "member" && !!m.can_create_episodes));
}

/** Where an episode stands for the person looking at it, as the home cards show it. */
export interface ReviewProgress {
  revealed: boolean;
  /** I take part and have not written yet. */
  myTurn: boolean;
  answered: number;
  total: number;
  /** The only person still missing, when exactly one is. */
  lastMissing: string | null;
}

export function reviewProgress(
  episode: Pick<Episode, "reviews_revealed_at">,
  authors: ReadonlySet<string> | undefined,
  reviewers: (Pick<SpaceMember, "user_id"> & { profile?: { name?: string | null } | null })[],
  userId: string | null,
  seasonUnlocked: boolean,
): ReviewProgress {
  const done = authors ?? new Set<string>();
  const missing = reviewers.filter((m) => !done.has(m.user_id));
  return {
    revealed: !!episode.reviews_revealed_at || seasonUnlocked,
    myTurn: !!userId && missing.some((m) => m.user_id === userId),
    answered: reviewers.length - missing.length,
    total: reviewers.length,
    lastMissing: missing.length === 1 ? missing[0].profile?.name?.trim() || null : null,
  };
}

/** Display role accounting for un-promoted members being treated as observers. */
export function effectiveRole(
  member: Pick<SpaceMember, "role" | "can_create_episodes"> | null | undefined
): MemberRole {
  if (!member) return "observer";
  if (member.role === "member" && !member.can_create_episodes) return "observer";
  return member.role;
}

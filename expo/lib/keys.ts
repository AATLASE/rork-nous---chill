/** Centralised React Query keys to keep caches consistent across screens. */
export const qk = {
  spaces: ["spaces"] as const,
  space: (id: string) => ["space", id] as const,
  membership: (spaceId: string, userId: string | null) => ["membership", spaceId, userId] as const,
  members: (spaceId: string) => ["members", spaceId] as const,
  invite: (spaceId: string, role: string) => ["invite", spaceId, role] as const,
  episodes: (spaceId: string) => ["episodes", spaceId] as const,
  episode: (episodeId: string) => ["episode", episodeId] as const,
  media: (episodeId: string) => ["media", episodeId] as const,
  reviews: (episodeId: string) => ["reviews", episodeId] as const,
  reviewAuthors: (episodeId: string) => ["reviewAuthors", episodeId] as const,
  myReview: (episodeId: string, userId: string | null) => ["myReview", episodeId, userId] as const,
  comments: (episodeId: string) => ["comments", episodeId] as const,
  likes: (episodeId: string) => ["likes", episodeId] as const,
  ideas: (spaceId: string) => ["ideas", spaceId] as const,
  notifications: (userId: string | null) => ["notifications", userId] as const,
  synthese: (spaceId: string) => ["synthese", spaceId] as const,
} as const;

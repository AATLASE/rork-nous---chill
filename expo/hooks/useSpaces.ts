import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureSpaceInviteCode } from "@/lib/invites";
import { qk } from "@/lib/keys";
import { supabase } from "@/lib/supabase";
import type { MemberRole, Space, SpaceMember, SpaceWithMembership } from "@/lib/types";
import { useAuth } from "@/providers/auth";

interface MembershipRow {
  role: SpaceMember["role"];
  can_create_episodes: boolean;
  joined_at: string;
  space_id: string;
  user_id: string;
  spaces: Space | null;
}

export interface SpaceDetail extends Space {
  membership: SpaceMember | null;
}

export function useMySpaces() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.spaces,
    enabled: !!userId,
    queryFn: async (): Promise<SpaceWithMembership[]> => {
      const { data, error } = await supabase
        .from("space_members")
        .select("role, can_create_episodes, joined_at, space_id, user_id, spaces(*)")
        .eq("user_id", userId as string);
      if (error) throw error;

      const rows = (data ?? []) as unknown as MembershipRow[];
      return rows
        .filter((r) => r.spaces)
        .map((r) => ({
          ...(r.spaces as Space),
          membership: {
            space_id: r.space_id,
            user_id: r.user_id,
            role: r.role,
            can_create_episodes: r.can_create_episodes,
            joined_at: r.joined_at,
          },
        }))
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    },
  });
}

export function useSpace(spaceId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.space(spaceId),
    enabled: !!spaceId && !!userId,
    queryFn: async (): Promise<SpaceDetail> => {
      const { data: space, error } = await supabase.from("spaces").select("*").eq("id", spaceId).single();
      if (error) throw error;
      const { data: membership } = await supabase
        .from("space_members")
        .select("*")
        .eq("space_id", spaceId)
        .eq("user_id", userId as string)
        .maybeSingle();
      return { ...(space as Space), membership: (membership as SpaceMember | null) ?? null };
    },
  });
}

interface CreateSpaceInput {
  name: string;
  description?: string;
  coverUrl?: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

/**
 * Builds a URL-safe slug from a space name plus a short random suffix. The
 * `spaces.slug` column is NOT NULL (and typically unique), so the client must
 * provide one — the suffix keeps two identically-named spaces from colliding.
 */
function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics (incl. emoji) → dashes
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `espace-${suffix}`;
}

export interface CreateSpaceResult {
  space: Space;
}

export function useCreateSpace() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSpaceInput): Promise<CreateSpaceResult> => {
      const { data: space, error } = await supabase
        .from("spaces")
        .insert({
          name: input.name.trim(),
          slug: makeSlug(input.name),
          description: input.description?.trim() || null,
          cover_url: input.coverUrl ?? null,
          created_by: userId,
          season_start: input.seasonStart,
          season_end: input.seasonEnd,
          season_unlocked: false,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Ensure the creator is registered as owner (a DB trigger may already have done this).
      const { error: memberError } = await supabase.from("space_members").insert({
        space_id: (space as Space).id,
        user_id: userId,
        role: "owner",
        can_create_episodes: true,
      });
      if (memberError && !/duplicate|already exists|conflict/i.test(memberError.message)) {
        throw memberError;
      }

      // Every space owns its two permanent invite codes from birth.
      for (const role of ["member", "observer"] as const) {
        try {
          const invite = await ensureSpaceInviteCode((space as Space).id, userId as string, role);
          queryClient.setQueryData(qk.invite((space as Space).id, role), invite);
        } catch (inviteError) {
          // Nice-to-have: the invite cards create it on first read if this failed.
          console.log(`[create-space] ${role} invite code creation failed:`, inviteError);
        }
      }

      return { space: space as Space };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export interface JoinResult {
  spaceId: string;
  alreadyMember: boolean;
  /** The role the person now has in the space. */
  role: MemberRole;
}

interface JoinRow {
  space_id: string;
  already_member: boolean;
  role?: MemberRole | null;
}

/** The toast shown after joining, which says what the person can now do. */
export function joinMessage(result: JoinResult): string {
  if (result.role === "owner") return "Tu fais déjà partie de cet espace.";
  if (result.role === "member") {
    return result.alreadyMember
      ? "Tu participes à cet espace : épisodes et reviews sont à toi."
      : "Bienvenue ! Tu peux créer des épisodes et écrire tes reviews.";
  }
  return result.alreadyMember ? "Tu fais déjà partie de cet espace." : "Bienvenue ! Tu suis l'aventure en observateur.";
}

export function useJoinSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawCode: string): Promise<JoinResult> => {
      const code = rawCode.trim().toUpperCase();
      if (!code) throw new Error("Saisis un code d'invitation.");

      // Redemption goes through a SECURITY DEFINER function: RLS hides
      // `invite_codes` from anyone who is not already a member of the space,
      // which is precisely the person redeeming the code. See
      // supabase/migrations/20260801010000_join_space_with_code.sql.
      const { data, error } = await supabase.rpc("join_space_with_code", { p_code: code });
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as JoinRow | undefined;
      if (!row?.space_id) throw new Error("Code invalide. Vérifie-le auprès du propriétaire de l'espace.");

      return { spaceId: row.space_id, alreadyMember: !!row.already_member, role: row.role ?? "observer" };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

interface UpdateSpaceInput {
  spaceId: string;
  patch: Partial<Pick<Space, "name" | "description" | "cover_url" | "season_start" | "season_end" | "season_unlocked">>;
}

export function useUpdateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, patch }: UpdateSpaceInput): Promise<Space> => {
      const { data, error } = await supabase.from("spaces").update(patch).eq("id", spaceId).select("*").single();
      if (error) throw error;
      return data as Space;
    },
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: qk.space(space.id) });
      queryClient.invalidateQueries({ queryKey: qk.spaces });
      queryClient.invalidateQueries({ queryKey: qk.synthese(space.id) });
    },
  });
}

export function useDeleteSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spaceId: string): Promise<void> => {
      const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

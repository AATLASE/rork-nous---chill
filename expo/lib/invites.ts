/**
 * Space invite codes.
 *
 * A space has two permanent codes, one per role — think of each as an address
 * of the space rather than a ticket handed to a specific person:
 *   - observer: sees the episodes, photos and revealed reviews;
 *   - member:   participates (creates episodes, writes reviews). Participants
 *               count for the reveal, so only the owner can read this code.
 * Codes never expire and have no usage limit. If one leaks, the owner
 * regenerates it, which invalidates the previous one.
 *
 * Codes live in the `invite_codes` table, one row per (space, role). The
 * per-person columns (`max_uses`, `expires_at`) are kept for schema
 * compatibility but are always written as unlimited / never.
 */
import { supabase } from "@/lib/supabase";
import type { InviteCode, InviteRole } from "@/lib/types";

/** Ambiguous glyphs (0/O, 1/I) are excluded so codes stay easy to dictate. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSpaceCode(length = 7): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

function isConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate|already exists|conflict/i.test(error.message ?? "");
}

/** Reads the space's code for a role, tolerating legacy spaces that still hold several rows. */
async function readSpaceInviteCode(spaceId: string, role: InviteRole): Promise<InviteCode | null> {
  const { data, error } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("space_id", spaceId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as InviteCode | undefined) ?? null;
}

async function insertSpaceInviteCode(spaceId: string, userId: string, role: InviteRole): Promise<InviteCode> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("invite_codes")
      .insert({
        code: generateSpaceCode(),
        space_id: spaceId,
        role,
        max_uses: null,
        use_count: 0,
        expires_at: null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (!error) return data as InviteCode;
    if (!isConflict(error)) throw error;

    // Either the random code collided, or another device just created the
    // space code. Re-read before burning another attempt.
    const existing = await readSpaceInviteCode(spaceId, role);
    if (existing) return existing;
  }
  throw new Error("Impossible de générer le code de l'espace. Réessaie.");
}

/** Returns the space's code for a role, creating it on the fly if it has none yet. */
export async function ensureSpaceInviteCode(spaceId: string, userId: string, role: InviteRole): Promise<InviteCode> {
  const existing = await readSpaceInviteCode(spaceId, role);
  if (existing) return existing;
  return insertSpaceInviteCode(spaceId, userId, role);
}

/**
 * Replaces the space's code with a fresh one. Existing members keep their
 * access — only the old code stops working.
 */
export async function regenerateSpaceInviteCode(spaceId: string, userId: string, role: InviteRole): Promise<InviteCode> {
  const { error } = await supabase.from("invite_codes").delete().eq("space_id", spaceId).eq("role", role);
  if (error) throw error;
  return insertSpaceInviteCode(spaceId, userId, role);
}

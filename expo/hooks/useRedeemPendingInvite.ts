import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useJoinSpace } from "@/hooks/useSpaces";
import { friendlyError } from "@/lib/errors";
import { qk } from "@/lib/keys";
import { queryClient } from "@/lib/queryClient";
import { clearPendingInvite, getPendingInvite } from "@/lib/pendingInvite";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

/**
 * Joins the space of a remembered invite code as soon as a session exists.
 *
 * The code is stored when an invite link is opened while signed out, typed at
 * signup, or carried into Google/Apple sign-in. Before this, nothing ever used
 * it: a friend who opened an invite, created an account and signed in landed on
 * an empty home screen. Runs on every sign-in; a missing code is a no-op.
 */
export function useRedeemPendingInvite(): void {
  const { isAuthenticated, initializing, recoveryMode } = useAuth();
  const joinSpace = useJoinSpace();
  const { select } = useActiveSpace();
  const toast = useToast();
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (initializing || !isAuthenticated || recoveryMode || running.current) return;
    running.current = true;
    (async () => {
      const code = await getPendingInvite();
      if (!code) return;
      try {
        const result = await joinSpace.mutateAsync(code);
        // Right after sign-in the space list was fetched while the user had no
        // space yet; wait for the fresh list so home doesn't say "Aucun espace".
        await queryClient.refetchQueries({ queryKey: qk.spaces });
        select(result.spaceId);
        toast.success(
          result.alreadyMember
            ? "Tu fais déjà partie de cet espace."
            : "Bienvenue ! Tu es observateur pour l'instant."
        );
        router.replace("/");
      } catch (error) {
        toast.error(friendlyError(error));
      } finally {
        // A bad or expired code must not be retried on every launch.
        await clearPendingInvite();
      }
    })().finally(() => {
      running.current = false;
    });
    // Only a change of session should trigger a redemption, not new hook identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, initializing, recoveryMode]);
}

import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { joinMessage, useJoinSpace } from "@/hooks/useSpaces";
import { friendlyError } from "@/lib/errors";
import { qk } from "@/lib/keys";
import { hasSeenOnboarding } from "@/lib/onboarding";
import { clearPendingInvite, getPendingInvite } from "@/lib/pendingInvite";
import { queryClient } from "@/lib/queryClient";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

/** Accounts older than this already know the app: no tutorial pushed on them after an update. */
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What happens once, right after a session appears.
 *
 * 1. Joins the space of a remembered invite code. The code is stored when an
 *    invite link is opened while signed out, typed at signup, or carried into
 *    Google/Apple sign-in. Before this, nothing ever used it: a friend who
 *    opened an invite, created an account and signed in landed on an empty
 *    home screen.
 * 2. Then shows the welcome tutorial to a new account that has not seen it on
 *    this device (it was only reachable from the profile). Done after the
 *    invite, whose navigation would otherwise replace the tutorial screen.
 */
export function useRedeemPendingInvite(): void {
  const { isAuthenticated, initializing, recoveryMode, userId, user } = useAuth();
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
      if (code) {
        try {
          const result = await joinSpace.mutateAsync(code);
          // Right after sign-in the space list was fetched while the user had no
          // space yet; wait for the fresh list so home doesn't say "Aucun espace".
          await queryClient.refetchQueries({ queryKey: qk.spaces });
          select(result.spaceId);
          toast.success(joinMessage(result));
          router.replace("/");
        } catch (error) {
          toast.error(friendlyError(error));
        } finally {
          // A bad or expired code must not be retried on every launch.
          await clearPendingInvite();
        }
      }

      const createdAt = user?.created_at ? Date.parse(user.created_at) : 0;
      if (userId && Date.now() - createdAt < NEW_ACCOUNT_MS && !(await hasSeenOnboarding(userId))) {
        router.push("/onboarding");
      }
    })().finally(() => {
      running.current = false;
    });
    // Only a change of session should trigger this, not new hook identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, initializing, recoveryMode]);
}

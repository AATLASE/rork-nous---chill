import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signInWithOAuthProvider, type OAuthProvider } from "@/lib/oauth";
import { sendPasswordReset } from "@/lib/passwordReset";
import { setPendingInvite } from "@/lib/pendingInvite";
import { unregisterPushToken } from "@/lib/push";
import type { Profile } from "@/lib/types";

interface SignUpArgs {
  email: string;
  password: string;
  name: string;
  inviteCode?: string | null;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  // True while the user is mid password-recovery (arrived from a reset link).
  // Gates the router onto the "set a new password" screen.
  const [recoveryMode, setRecoveryMode] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    // Never leave the app stuck on the splash: if getSession() rejects (e.g. a
    // browser that blocks local storage) or hangs (web-locks stall), we still
    // release the gate and fall back to the unauthenticated state.
    const finishInit = () => {
      if (active) setInitializing(false);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // Storage blocked / transient failure — continue signed out.
      })
      .finally(finishInit);

    // Failsafe: guarantee the splash is dismissed even if getSession() never
    // settles (some browsers stall the auth lock indefinitely).
    const failsafe = setTimeout(finishInit, 5000);

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Fired on web (detectSessionInUrl) when landing from a recovery link.
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(nextSession);
      // Any auth event means initialization resolved.
      finishInit();
      if (!nextSession) {
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user?.id ?? null;

  const profileQuery = useQuery<Profile | null>({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;

      // Auto-provision a profile row if a trigger didn't create one.
      const fallbackName =
        (session?.user?.user_metadata?.name as string | undefined) ??
        session?.user?.email?.split("@")[0] ??
        "Membre";
      const { data: created, error: upsertError } = await supabase
        .from("profiles")
        .upsert({ id: userId, name: fallbackName }, { onConflict: "id" })
        .select("*")
        .single();
      if (upsertError) throw upsertError;
      return created as Profile;
    },
  });

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async ({ email, password, name, inviteCode }: SignUpArgs) => {
    // Stored first: when signup returns a session, the redeem hook runs on that
    // session change and must already find the code.
    if (inviteCode) await setPendingInvite(inviteCode);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) throw error;
  }, []);

  /** Sends the "reset your password" email with a recovery link. */
  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordReset(email);
  }, []);

  /**
   * Sets a brand-new password using the active recovery session, then exits
   * recovery mode. The user stays signed in afterwards.
   */
  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  /** Enters recovery mode manually (native deep-link flow). */
  const enterRecoveryMode = useCallback(() => setRecoveryMode(true), []);

  /** Abandons a reset: drops the temporary recovery session, back to login. */
  const cancelRecovery = useCallback(async () => {
    setRecoveryMode(false);
    await supabase.auth.signOut();
  }, []);

  /**
   * Google / Apple sign-in via Supabase social OAuth. Persists a pending invite
   * first so it is redeemed after the (possibly new) account lands. Returns
   * `true` when a session was created, `false` when the user cancelled.
   */
  const signInWithProvider = useCallback(
    async (provider: OAuthProvider, inviteCode?: string | null): Promise<boolean> => {
      if (inviteCode?.trim()) await setPendingInvite(inviteCode);
      return signInWithOAuthProvider(provider);
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (userId) {
      try {
        await unregisterPushToken(userId);
      } catch {
        // Ignore — sign-out should proceed regardless.
      }
    }
    await supabase.auth.signOut();
  }, [userId]);

  return {
    session,
    user: (session?.user ?? null) as User | null,
    userId,
    profile: profileQuery.data ?? null,
    isAuthenticated: !!session,
    initializing,
    recoveryMode,
    profileLoading: profileQuery.isLoading,
    signIn,
    signUp,
    signInWithProvider,
    signOut,
    resendConfirmation,
    resetPassword,
    updatePassword,
    enterRecoveryMode,
    cancelRecovery,
    refetchProfile: profileQuery.refetch,
  };
});

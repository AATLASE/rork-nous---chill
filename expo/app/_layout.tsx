import { QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BrandSplash } from "@/components/BrandSplash";
import { InstallBanner } from "@/components/InstallBanner";
import { UploadStatus } from "@/components/UploadStatus";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { hasSupabaseConfig } from "@/lib/supabase";
import { registerServiceWorker } from "@/lib/pwa";
import { queryClient } from "@/lib/queryClient";
import { establishRecoverySession, isRecoveryUrl } from "@/lib/passwordReset";
import { setPendingInvite } from "@/lib/pendingInvite";
import { startUploadQueue } from "@/lib/uploadQueue";
import { ActiveSpaceProvider } from "@/providers/activeSpace";
import { AuthProvider, useAuth } from "@/providers/auth";
import { NotificationsProvider } from "@/providers/notifications";
import { ThemeProvider, useThemeMode } from "@/providers/theme";
import { ToastProvider, ToastViewport } from "@/providers/toast";

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { isAuthenticated, initializing, recoveryMode, enterRecoveryMode } = useAuth();
  const { resolved } = useThemeMode();
  const segments = useSegments();
  const router = useRouter();
  const [splashVisible, setSplashVisible] = useState<boolean>(true);

  // Auth routing gate.
  useEffect(() => {
    if (initializing) return;
    SplashScreen.hideAsync().catch(() => {});
    const inAuthGroup = segments[0] === "(auth)";
    const onReset = segments[0] === "reset-password";

    // Password recovery takes priority over everything: keep the user on the
    // "set a new password" screen until they finish or cancel.
    if (recoveryMode) {
      if (!onReset) router.replace("/reset-password");
      return;
    }
    // Never bounce away from the reset screen before recovery mode resolves
    // (the PASSWORD_RECOVERY event / native link parsing can arrive a tick late).
    if (!isAuthenticated && !inAuthGroup && !onReset) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/");
    }
  }, [isAuthenticated, initializing, segments, router, recoveryMode]);

  // Warm-start deep links (app already running). Cold-start links are handled
  // by app/+native-intent.tsx before the tree mounts.
  useEffect(() => {
    const sub = Linking.addEventListener("url", (e) => {
      // Password-recovery link: establish the temporary session, then route to
      // the reset screen. Web handles this automatically via detectSessionInUrl.
      if (isRecoveryUrl(e.url)) {
        establishRecoverySession(e.url)
          .then((ok) => {
            if (ok) {
              enterRecoveryMode();
              router.replace("/reset-password");
            }
          })
          .catch(() => {});
        return;
      }

      const parsed = Linking.parse(e.url);
      const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
      const isJoin = (parsed.path ?? "").toLowerCase().includes("join");
      if (code && isJoin) {
        setPendingInvite(code);
        if (isAuthenticated) {
          router.push({ pathname: "/join", params: { code } });
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, router, enterRecoveryMode]);

  return (
    // Remounting on scheme change lets every inline style pick up the new palette.
    <View key={`theme-${resolved}`} style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reset-password" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal", gestureEnabled: false, animation: "fade" }} />
        {/* Redirect shims keeping pre-tabs deep links and notification URLs alive. */}
        <Stack.Screen name="space/[id]/index" options={{ animation: "none" }} />
        <Stack.Screen name="space/[id]/[...rest]" options={{ animation: "none" }} />
        <Stack.Screen name="space-settings/[spaceId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="space-members/[spaceId]" />
        <Stack.Screen name="episode/[episodeId]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="create-space" options={{ presentation: "modal" }} />
        <Stack.Screen name="join" options={{ presentation: "modal" }} />
        <Stack.Screen name="review/[episodeId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="create-episode/[spaceId]" options={{ presentation: "modal" }} />
      </Stack>
      {/* After the splash, so the offer never competes with the brand moment. */}
      {splashVisible ? null : <InstallBanner />}
      {splashVisible ? (
        <BrandSplash done={!initializing} onHidden={() => setSplashVisible(false)} />
      ) : null}
    </View>
  );
}

/** Shown only if the Supabase env vars failed to load (e.g. before a rebuild). */
function ConfigMissing() {
  return (
    <View style={styles.configRoot}>
      <StatusBar style="light" />
      <View style={styles.configBadge}>
        <AppText variant="display" color={colors.primary}>
          G
        </AppText>
      </View>
      <AppText variant="h2" center style={styles.configTitle}>
        Configuration en cours
      </AppText>
      <AppText variant="bodyMuted" center>
        La connexion au serveur n&apos;est pas encore prête. Ferme et rouvre
        l&apos;application dans un instant — tout devrait fonctionner.
      </AppText>
    </View>
  );
}

export default function RootLayout() {
  // Installability + offline shell on web. No-op on native.
  useEffect(() => {
    registerServiceWorker();
    // Photos left over from a previous session go out now.
    startUploadQueue();
  }, []);

  if (!hasSupabaseConfig) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ConfigMissing />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AuthProvider>
              <ActiveSpaceProvider>
                <ToastProvider>
                  <NotificationsProvider>
                    <RootNav />
                    <UploadStatus />
                    <ToastViewport />
                  </NotificationsProvider>
                </ToastProvider>
              </ActiveSpaceProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  configRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  configBadge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  configTitle: {
    marginBottom: spacing.xs,
  },
});

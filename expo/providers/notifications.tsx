import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { colors } from "@/constants/theme";
import { queryClient } from "@/lib/queryClient";
import { loadNotifications, registerPushToken } from "@/lib/push";
import { useAuth } from "@/providers/auth";

/**
 * Sets up local notification handling: permissions, an Android channel, and
 * routing when the user taps a notification. Defensive so it never crashes the
 * app in Expo Go or the cloud simulator.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { userId } = useAuth();
  // The tap that opened the app is reported both by the listener (sometimes) and
  // by getLastNotificationResponseAsync: route it only once.
  const handledTap = useRef<string | null>(null);

  const openFromNotification = (identifier: string, url: string | undefined) => {
    if (handledTap.current === identifier) return;
    handledTap.current = identifier;
    // The notification is about something new: whatever is cached is older.
    void queryClient.invalidateQueries();
    try {
      router.push((url || "/notifications") as never);
    } catch {
      // Ignore navigation errors from background taps.
    }
  };

  // Register this device's Expo push token whenever a user is signed in.
  useEffect(() => {
    if (!userId) return;
    registerPushToken(userId);
  }, [userId]);

  // Cold start: when a tap launched the app, the listener below was not there
  // yet to hear it. Ask once the user is signed in, so the auth gate does not
  // redirect away from the episode right after we open it.
  useEffect(() => {
    if (!userId || Platform.OS === "web") return;
    const Notifications = loadNotifications();
    if (!Notifications) return;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as { url?: string } | undefined;
        openFromNotification(response.notification.request.identifier, data?.url);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    // The web has its own delivery path end to end: the service worker receives
    // the push and handles the click (see public/sw.js). expo-notifications has
    // nothing to add there, and asking it for permissions would pop the browser
    // prompt on load — which is both rude and, in Chrome, a good way to get
    // push denied permanently. The switch in Réglages asks instead.
    if (Platform.OS === "web") return;

    // Null in Expo Go, where notifications are unavailable anyway.
    const Notifications = loadNotifications();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });

    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Gather",
            importance: Notifications.AndroidImportance.DEFAULT,
            lightColor: colors.primary,
            vibrationPattern: [0, 120, 80, 120],
          });
        }
        // No permission request here: asking at launch, before the user wants
        // anything (and even on the login screen), burns the one prompt iOS
        // allows. The switch in the profile asks.
      } catch {
        // Notifications are best-effort; ignore failures in restricted runtimes.
      }
    })();

    // The badge counted unread pushes and was never reset: opening the app
    // clears it, the list inside the app keeps the details.
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") Notifications.setBadgeCountAsync(0).catch(() => {});
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { url?: string } | undefined;
      openFromNotification(response.notification.request.identifier, data?.url);
    });

    return () => {
      sub.remove();
      appState.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return <>{children}</>;
}

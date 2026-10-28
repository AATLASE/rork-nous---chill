import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useSegments } from "expo-router";
import { CircleCheck, Ellipsis, Globe, Share, SquarePlus, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/Text";
import { colors, radius, shadows, spacing } from "@/constants/theme";
import { getInstallPath, promptInstall, subscribeInstall, type InstallPath } from "@/lib/pwa";
import { useToast } from "@/providers/toast";

const SNOOZE_KEY = "gather.install-banner.snoozed-at";
/** "Plus tard" means later, not never: the banner comes back after a week. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** Let the first screen land before asking for anything. */
const SHOW_DELAY_MS = 1500;
/** The web tab bar is 64px high (see app/(tabs)/_layout.tsx); the banner sits above it. */
const TAB_BAR_HEIGHT = 64;

function isSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SNOOZE_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    // Private browsing: the banner simply comes back next visit.
  }
}

function Step({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, { backgroundColor: colors.primarySoft }]}>{icon}</View>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText style={[styles.stepTitle, { color: colors.text }]}>{title}</AppText>
        {hint ? <AppText style={[styles.hint, { color: colors.textMuted }]}>{hint}</AppText> : null}
      </View>
    </View>
  );
}

/**
 * Offers to install the PWA, so nobody has to know that "Add to Home Screen"
 * exists, let alone where Safari hides it.
 *
 * Web only, and only on the entry screens (login and the tabs): over a modal it
 * would sit on top of the very buttons the modal is for.
 */
export function InstallBanner() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { success: toastSuccess } = useToast();

  const [path, setPath] = useState<InstallPath | null>(() => getInstallPath());
  const [ready, setReady] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(() => isSnoozed());
  const [expanded, setExpanded] = useState<boolean>(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeInstall(() => setPath(getInstallPath())), []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const onEntryScreen = segments[0] === "(auth)" || segments[0] === "(tabs)";
  const visible = ready && !dismissed && path !== null && onEntryScreen;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [visible, anim]);

  if (!visible) return null;

  const close = (): void => {
    snooze();
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setDismissed(true),
    );
  };

  const onInstall = async (): Promise<void> => {
    if (path !== "prompt") {
      setExpanded((open) => !open);
      return;
    }
    // On "accepted", `appinstalled` follows and the banner goes for good.
    if ((await promptInstall()) === "dismissed") snooze();
  };

  const copyLink = async (): Promise<void> => {
    await Clipboard.setStringAsync(window.location.origin);
    toastSuccess("Lien copié — colle-le dans Safari ou Chrome.");
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const bottom = insets.bottom + spacing.md + (segments[0] === "(tabs)" ? TAB_BAR_HEIGHT : 0);

  let actionLabel = path === "in-app" ? "Comment ?" : "Installer";
  if (expanded) actionLabel = "Masquer";

  return (
    <Animated.View
      accessibilityRole="alert"
      style={[styles.wrap, { bottom, opacity: anim, transform: [{ translateY }] }]}
    >
      {/* Colors inline: the palette is swapped in place on theme change, and a
          StyleSheet would keep the one it was created with. */}
      <View
        style={[
          styles.box,
          { backgroundColor: colors.bgElevated, borderColor: colors.borderStrong },
          shadows.poster,
        ]}
      >
        <View style={styles.row}>
          <Image source={{ uri: "/icon-192.png" }} style={styles.icon} contentFit="cover" />
          <View style={{ flex: 1, gap: 1 }}>
            <AppText style={[styles.title, { color: colors.text }]}>Installe Gather</AppText>
            <AppText style={[styles.hint, { color: colors.textMuted }]} numberOfLines={2}>
              {path === "in-app"
                ? "Ouvre ce lien dans ton navigateur pour avoir l'app."
                : "Sur ton écran d'accueil, en plein écran, avec les notifications."}
            </AppText>
          </View>
          <Button title={actionLabel} size="sm" onPress={onInstall} />
          <IconButton
            icon={<X size={18} color={colors.textMuted} />}
            variant="ghost"
            size={32}
            onPress={close}
            accessibilityLabel="Plus tard"
          />
        </View>

        {expanded && path === "ios" ? (
          <View style={[styles.steps, { borderTopColor: colors.border }]}>
            <Step
              icon={<Share size={18} color={colors.primary} />}
              title="Touche le bouton Partager"
              hint="Dans la barre de Safari — ou dans le menu ⋯ selon ta version."
            />
            <Step
              icon={<SquarePlus size={18} color={colors.primary} />}
              title="Choisis « Sur l'écran d'accueil »"
              hint="Fais défiler la liste si tu ne le vois pas."
            />
            <Step
              icon={<CircleCheck size={18} color={colors.primary} />}
              title="Valide avec « Ajouter »"
              hint="Gather apparaît alors avec tes autres apps."
            />
          </View>
        ) : null}

        {expanded && path === "in-app" ? (
          <View style={[styles.steps, { borderTopColor: colors.border }]}>
            <Step
              icon={<Ellipsis size={18} color={colors.primary} />}
              title="Touche le menu ⋯ de l'appli"
              hint="En haut ou en bas de l'écran."
            />
            <Step
              icon={<Globe size={18} color={colors.primary} />}
              title="Choisis « Ouvrir dans le navigateur »"
              hint="Ou copie le lien et colle-le dans Safari ou Chrome."
            />
            <Button title="Copier le lien" variant="secondary" size="sm" fullWidth onPress={copyLink} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    // Below the upload status and the toasts: those report on something the
    // user just did, this is only an offer.
    zIndex: 800,
    alignItems: "center",
  },
  box: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12.5,
  },
  steps: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
});

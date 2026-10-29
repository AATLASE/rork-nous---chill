import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowRight, Camera, Clapperboard, Lightbulb, Star, Ticket, Users } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Animated, ScrollView, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, shadows, spacing } from "@/constants/theme";
import { markOnboardingSeen } from "@/lib/onboarding";
import { useAuth } from "@/providers/auth";

interface Slide {
  key: string;
  overline: string;
  title: string;
  body: string;
  icon: "brand" | "space" | "invite" | "episode" | "ideas";
}

// The overlines used to read "Épisode 1…4", which collided head-on with
// "épisode" as the product's core object — the tutorial explained the metaphor
// using the metaphor. They are plain step counters now, and each slide defines
// its invented word in ordinary language before using it.
const SLIDES: Slide[] = [
  {
    key: "welcome",
    overline: "Bienvenue",
    title: "Bienvenue sur Gather",
    body: "Vos moments partagés deviennent une série à revivre. Trois mots à retenir : un espace (votre groupe), un épisode (un moment vécu), une saison (la période que vous traversez ensemble).",
    icon: "brand",
  },
  {
    key: "space",
    overline: "Étape 1 sur 4",
    title: "Crée ton espace",
    body: "Un espace, c'est tout simplement ton groupe : ton couple, ta bande d'amis ou ta famille. Il a sa propre couverture, comme une affiche de série.",
    icon: "space",
  },
  {
    key: "invite",
    overline: "Étape 2 sur 4",
    title: "Invite tes proches",
    body: "Deux liens d'invitation : participant pour ceux qui créent des épisodes et écrivent leur review, observateur pour ceux qui suivent l'aventure. Tu les retrouves dans Profil, rubrique Membres.",
    icon: "invite",
  },
  {
    key: "episode",
    overline: "Étape 3 sur 4",
    title: "Ajoutez vos moments",
    body: "Chaque sortie, dîner ou voyage devient un épisode : photos, vidéos et petites notes pour ne rien oublier.",
    icon: "episode",
  },
  {
    key: "ideas",
    overline: "Étape 4 sur 4",
    title: "Idées et révélation",
    body: "Proposez vos prochaines sorties et votez. Vos impressions sur un moment restent privées tant que tout le groupe n'a pas écrit la sienne — puis elles se révèlent d'un coup.",
    icon: "ideas",
  },
];

function SlideArt({ icon }: { icon: Slide["icon"] }) {
  if (icon === "brand") {
    return <BrandMark size={116} />;
  }

  const inner = (() => {
    switch (icon) {
      case "space":
        return <Clapperboard size={52} color={colors.primary} />;
      case "invite":
        return <Ticket size={52} color={colors.accent} />;
      case "episode":
        return <Camera size={52} color={colors.primary} />;
      case "ideas":
        return <Lightbulb size={52} color={colors.accent} />;
    }
  })();

  const badge = (() => {
    switch (icon) {
      case "space":
        return <Users size={18} color={colors.text} />;
      case "invite":
        return <AppText style={{ fontSize: 13, fontWeight: "800" as const, color: colors.text, letterSpacing: 1 }}>CODE</AppText>;
      case "episode":
        return <AppText style={{ fontSize: 13, fontWeight: "800" as const, color: colors.text }}>S1 · E1</AppText>;
      case "ideas":
        return <Star size={18} color={colors.accent} fill={colors.accent} />;
    }
  })();

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <View
        style={[
          {
            width: 148,
            height: 148,
            borderRadius: radius.xxl,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
          },
          shadows.poster,
        ]}
      >
        <LinearGradient
          colors={[colors.cardElevated, colors.bgDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          {inner}
        </LinearGradient>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: -14,
          paddingHorizontal: 14,
          height: 32,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        }}
      >
        {badge}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { width } = useWindowDimensions();

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState<number>(0);

  const isLast = page === SLIDES.length - 1;

  const finish = async () => {
    if (userId) await markOnboardingSeen(userId);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      {/* Subtle top glow to give the screen depth. */}
      <LinearGradient
        colors={["rgba(239,35,60,0.14)", "rgba(239,35,60,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320 }}
      />

      {/* Skip */}
      <View
        style={{
          position: "absolute",
          top: insets.top + spacing.sm,
          right: spacing.lg,
          zIndex: 10,
        }}
      >
        {!isLast ? (
          <TouchableOpacity
            onPress={finish}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppText style={{ color: colors.textMuted, fontWeight: "700", fontSize: 13 }}>Passer</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== page && next >= 0 && next < SLIDES.length) {
              setPage(next);
              haptic();
            }
          },
        })}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.72, 1, 0.72], extrapolate: "clamp" });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: "clamp" });
          const textTranslate = scrollX.interpolate({ inputRange, outputRange: [40, 0, -40], extrapolate: "clamp" });

          return (
            <View
              key={slide.key}
              style={{
                width,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: spacing.xxl,
                paddingBottom: 140,
                paddingTop: insets.top + spacing.xxl,
              }}
            >
              <Animated.View style={{ transform: [{ scale }], opacity, marginBottom: spacing.xxxl + spacing.md }}>
                <SlideArt icon={slide.icon} />
              </Animated.View>

              <Animated.View style={{ opacity, transform: [{ translateX: textTranslate }], alignItems: "center", gap: spacing.md }}>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: radius.pill,
                    backgroundColor: slide.icon === "brand" || slide.icon === "space" || slide.icon === "episode" ? colors.primarySoft : colors.accentSoft,
                  }}
                >
                  <AppText
                    variant="overline"
                    style={{ color: slide.icon === "brand" || slide.icon === "space" || slide.icon === "episode" ? colors.primary : colors.accent }}
                  >
                    {slide.overline}
                  </AppText>
                </View>
                <AppText variant="title" center>
                  {slide.title}
                </AppText>
                <AppText variant="bodyMuted" center style={{ maxWidth: 320 }}>
                  {slide.body}
                </AppText>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      {/* Bottom controls */}
      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + spacing.xl,
          left: spacing.xl,
          right: spacing.xl,
          gap: spacing.xl,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 7 }}>
          {SLIDES.map((slide, index) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const dotWidth = scrollX.interpolate({ inputRange, outputRange: [7, 24, 7], extrapolate: "clamp" });
            const dotOpacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: "clamp" });
            return (
              <Animated.View
                key={slide.key}
                style={{
                  width: dotWidth,
                  height: 7,
                  borderRadius: radius.pill,
                  backgroundColor: colors.primary,
                  opacity: dotOpacity,
                }}
              />
            );
          })}
        </View>

        <Button
          title={isLast ? "C'est parti 🎬" : "Suivant"}
          size="lg"
          fullWidth
          iconRight={isLast ? undefined : <ArrowRight size={19} color={colors.primaryFg} />}
          onPress={goNext}
        />
      </View>
    </View>
  );
}

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, ImageIcon, MapPin, Sparkles, Video } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { FadeIn, PressableScale } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, shadows, spacing } from "@/constants/theme";
import { formatDateShort, normalizeTags } from "@/lib/format";
import type { Episode } from "@/lib/types";

/**
 * The cover is set once, at creation, and nothing changes it afterwards —
 * photos dropped into an episode later belong to its album, not to its poster.
 * An episode without a cover keeps the placeholder rather than borrowing the
 * newest image.
 */
export function getEpisodeCover(episode: Episode): string | null {
  return episode.cover_url ?? null;
}

function MediaCountBadge({ episode }: { episode: Episode }) {
  const count = episode.media_count ?? episode.media?.length ?? 0;
  if (count === 0) return null;
  const hasVideo = (episode.media ?? []).some((m) => m.type === "video");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill }}>
      {hasVideo ? <Video size={12} color="#fff" /> : <ImageIcon size={12} color="#fff" />}
      <AppText style={{ color: "#fff", fontSize: 11.5, fontWeight: "700" }}>{count}</AppText>
    </View>
  );
}

/**
 * An episode reveals its reviews on its own, the moment the last participant
 * publishes — nobody presses a button for it, so the list has to be where you
 * notice it happened.
 */
function RevealedBadge({ episode }: { episode: Episode }) {
  if (!episode.reviews_revealed_at) return null;
  return <Badge label="Révélé" tone="gold" icon={<Sparkles size={11} color={colors.accent} />} />;
}

export function EpisodePoster({ episode, width = 144, index = 0, onPress }: { episode: Episode; width?: number; index?: number; onPress: () => void }) {
  const cover = getEpisodeCover(episode);
  return (
    <FadeIn delay={index * 60}>
      <PressableScale onPress={onPress} scaleTo={0.97} style={[{ width, height: width * 1.5, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, shadows.card]}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={[colors.heroFrom, colors.heroTo]} style={{ position: "absolute", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
            <AppText style={{ fontSize: 44, opacity: 0.55 }}>🎬</AppText>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(8,8,9,0.9)"]} locations={[0.4, 1]} style={{ position: "absolute", width: "100%", height: "100%" }} />
        <View style={{ position: "absolute", top: 8, left: 8, right: 8, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
          <RevealedBadge episode={episode} />
          <View style={{ marginLeft: "auto" }}>
            <MediaCountBadge episode={episode} />
          </View>
        </View>
        <View style={{ position: "absolute", bottom: 10, left: 10, right: 10, gap: 2 }}>
          <AppText numberOfLines={2} style={{ color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: -0.2 }}>
            {episode.title}
          </AppText>
          {episode.date ? (
            <AppText style={{ color: "rgba(255,255,255,0.65)", fontSize: 11.5, fontWeight: "600" }}>{formatDateShort(episode.date)}</AppText>
          ) : null}
        </View>
      </PressableScale>
    </FadeIn>
  );
}

export function EpisodeRow({ episode, index = 0, onPress }: { episode: Episode; index?: number; onPress: () => void }) {
  const cover = getEpisodeCover(episode);
  const tags = normalizeTags(episode.tags);
  return (
    <FadeIn delay={index * 50}>
      <PressableScale onPress={onPress} scaleTo={0.98} style={{ flexDirection: "row", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, alignItems: "center" }}>
        <View style={{ width: 60, height: 80, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surface }}>
          {cover ? (
            <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <AppText style={{ fontSize: 26 }}>🎬</AppText>
            </View>
          )}
        </View>
        <View style={{ flex: 1, gap: 3, paddingVertical: 2 }}>
          <AppText numberOfLines={1} variant="h3">{episode.title}</AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {episode.date ? <AppText variant="caption">{formatDateShort(episode.date)}</AppText> : null}
            {episode.place ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <MapPin size={11} color={colors.textFaint} />
                <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 120 }}>{episode.place}</AppText>
              </View>
            ) : null}
          </View>
          {tags.length > 0 || episode.reviews_revealed_at ? (
            <View style={{ flexDirection: "row", gap: 5, marginTop: 1, flexWrap: "wrap" }}>
              <RevealedBadge episode={episode} />
              {tags.slice(0, 2).map((t) => (
                <Badge key={t} label={t} tone="muted" />
              ))}
            </View>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textFaint} />
      </PressableScale>
    </FadeIn>
  );
}

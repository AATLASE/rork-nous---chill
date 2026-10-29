import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { FullscreenVideo, VideoPoster } from "@/components/VideoSurface";
import { AppText } from "@/components/ui/Text";
import { IconButton } from "@/components/ui/Button";
import { colors, radius, spacing } from "@/constants/theme";
import type { EpisodeMedia } from "@/lib/types";

/** A media row without a type is a photo — the column arrived after the app did. */
function isVideo(m: EpisodeMedia): boolean {
  return m.type === "video";
}

function FullscreenViewer({ media, initialIndex, onClose }: { media: EpisodeMedia[]; initialIndex: number; onClose: () => void }) {
  const [active, setActive] = useState<number>(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  // Read at render rather than once at import: the paging width has to be the
  // width the pages are actually laid out at, rotation and split view included.
  const { width, height } = useWindowDimensions();

  // `contentOffset` below only lands on iOS: without this, tapping the fourth
  // clip of an album opened the first one on Android.
  useEffect(() => {
    if (initialIndex > 0) scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false });
  }, [initialIndex, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
          onMomentumScrollEnd={onScroll}
        >
          {media.map((m, i) => (
            <View key={m.id} style={{ width, height: "100%", alignItems: "center", justifyContent: "center" }}>
              {isVideo(m) ? (
                // Sized in points, never left to the native surface — a video
                // that measures itself lands far wider than the screen and
                // shows as a zoomed-in crop.
                <FullscreenVideo url={m.url} width={width} height={height} active={i === active} />
              ) : (
                <Image source={{ uri: m.url }} style={{ width, height }} contentFit="contain" transition={150} />
              )}
            </View>
          ))}
        </ScrollView>
        <View style={{ position: "absolute", top: 54, right: spacing.lg }}>
          <IconButton icon={<X size={22} color="#fff" />} onPress={onClose} size={44} style={{ backgroundColor: "rgba(255,255,255,0.15)" }} accessibilityLabel="Fermer la galerie" />
        </View>
        {media.length > 1 ? (
          <View style={{ position: "absolute", bottom: 50, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
            {media.map((m, i) => (
              <View key={m.id} style={{ width: i === active ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === active ? "#fff" : "rgba(255,255,255,0.4)" }} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * The album: every photo and video of an episode, as tappable thumbnails.
 *
 * Deliberately separate from the hero above, which only ever shows the cover:
 * dropping a photo into an episode months later should fill the album, not
 * rewrite the poster at the top of the screen.
 */
export function MediaGrid({
  media,
  emptyLabel,
  onDelete,
}: {
  media: EpisodeMedia[];
  emptyLabel?: string;
  /** Passed only when the viewer may remove media — shows a ✕ on each tile. */
  onDelete?: (item: EpisodeMedia) => void;
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  // Measured rather than derived from the window, so the tiles stay square
  // whatever padding the parent screen uses.
  const [width, setWidth] = useState<number>(0);
  const gap = 6;
  const tile = width > 0 ? (width - gap * 2) / 3 : 0;

  if (!media || media.length === 0) {
    return emptyLabel ? <AppText variant="bodyMuted">{emptyLabel}</AppText> : null;
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {tile > 0
        ? media.map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => setViewer(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={isVideo(m) ? "Voir la vidéo" : "Voir la photo"}
              style={{ width: tile, height: tile, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface }}
            >
              {isVideo(m) ? (
                // A frame out of the clip, so the album shows what was filmed
                // instead of a row of identical black squares.
                <VideoPoster url={m.url} play="small" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
              )}

              {onDelete ? (
                <Pressable
                  onPress={() => onDelete(m)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={isVideo(m) ? "Supprimer la vidéo" : "Supprimer la photo"}
                  style={{ position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: radius.pill, padding: 4 }}
                >
                  <X size={13} color="#fff" />
                </Pressable>
              ) : null}
            </Pressable>
          ))
        : null}

      {viewer !== null ? <FullscreenViewer media={media} initialIndex={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

export function MediaGallery({ media, height = 360, emoji = "🎬" }: { media: EpisodeMedia[]; height?: number; emoji?: string }) {
  const [index, setIndex] = useState<number>(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const { width } = useWindowDimensions();

  if (!media || media.length === 0) {
    return (
      <LinearGradient colors={[colors.heroFrom, colors.heroTo]} style={{ height, alignItems: "center", justifyContent: "center" }}>
        <AppText style={{ fontSize: 74, opacity: 0.5 }}>{emoji}</AppText>
      </LinearGradient>
    );
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ height }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>
        {media.map((m, i) => (
          <Pressable key={m.id} onPress={() => setViewer(i)} style={{ width, height }}>
            {isVideo(m) ? (
              // The hero is a poster slot: the frame is cropped to fill it like
              // a cover photo, and tapping opens the clip full screen.
              <VideoPoster url={m.url} contentFit="cover" play="large" label="Lire la vidéo" style={{ width, height }} />
            ) : (
              <Image source={{ uri: m.url }} style={{ width, height }} contentFit="cover" transition={200} />
            )}
          </Pressable>
        ))}
      </ScrollView>

      {media.length > 1 ? (
        <View style={{ position: "absolute", bottom: spacing.md, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {media.map((m, i) => (
            <View key={m.id} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.45)" }} />
          ))}
        </View>
      ) : null}

      {viewer !== null ? <FullscreenViewer media={media} initialIndex={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

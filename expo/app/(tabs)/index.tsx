import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ChevronRight, Clapperboard, LayoutGrid, Lock, PenLine, Plus, Rows3, Settings, Sparkles } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Dimensions, RefreshControl, View } from "react-native";
import { EpisodePoster, EpisodeRow } from "@/components/EpisodeCard";
import { NoSpaceState } from "@/components/NoSpaceState";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, Screen, SectionHeader } from "@/components/ui/Card";
import { EmptyState, Loader } from "@/components/ui/Feedback";
import { FadeIn, PressableScale, Pulse } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, shadows, spacing } from "@/constants/theme";
import { formatDateShort, getSeasonStatus, type SeasonStatus } from "@/lib/format";
import { canParticipate, isOwner, reviewersOf, reviewProgress, type ReviewProgress } from "@/lib/types";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useMembers } from "@/hooks/useMembers";
import { useSpaceReviewAuthors } from "@/hooks/useReviews";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";

type ViewMode = "grid" | "timeline";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2;

function ModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3 }}>
      {(["grid", "timeline"] as ViewMode[]).map((m) => {
        const active = mode === m;
        const Icon = m === "grid" ? LayoutGrid : Rows3;
        return (
          <PressableScale
            key={m}
            onPress={() => onChange(m)}
            withHaptic={false}
            accessibilityRole="button"
            accessibilityLabel={m === "grid" ? "Affichage en grille" : "Affichage en timeline"}
            accessibilityState={{ selected: active }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: active ? colors.surface : "transparent" }}
          >
            <Icon size={15} color={active ? colors.text : colors.textMuted} />
            <AppText style={{ fontSize: 13, fontWeight: "600", color: active ? colors.text : colors.textMuted }}>{m === "grid" ? "Grille" : "Timeline"}</AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** "Saison en cours · J-12", or whatever the season is doing instead. */
function seasonLine(status: SeasonStatus): string {
  switch (status.state) {
    case "unlocked":
      return "Saison débloquée";
    case "ended":
      return "Saison terminée";
    case "upcoming":
      return status.label;
    default:
      return status.daysLeft !== null ? `Saison en cours · J-${status.daysLeft}` : "Saison en cours";
  }
}

/**
 * The reviews waiting for you, oldest first: one line at the top of the home
 * screen, because that is what makes an episode reveal for everyone.
 */
function ReviewWaitingBanner({ title, others, onPress }: { title: string; others: number; onPress: () => void }) {
  return (
    <FadeIn>
      <PressableScale
        onPress={onPress}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`« ${title} » attend ta review. Écrire`}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
      >
        <PenLine size={18} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText numberOfLines={2} style={{ fontWeight: "700", fontSize: 14.5, color: colors.text }}>
            « {title} » attend ta review
          </AppText>
          {others > 0 ? (
            <AppText variant="caption">
              et {others} autre{others > 1 ? "s" : ""} épisode{others > 1 ? "s" : ""}
            </AppText>
          ) : null}
        </View>
        <AppText style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>Écrire ›</AppText>
      </PressableScale>
    </FadeIn>
  );
}

export default function MomentsScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { space, isLoading, hasNoSpace, refetch, isRefetching } = useActiveSpace();
  const spaceId = space?.id ?? "";

  const { data: episodes, isLoading: episodesLoading } = useEpisodes(spaceId);
  const { data: members } = useMembers(spaceId);
  const { data: reviewAuthors } = useSpaceReviewAuthors(spaceId);
  const [mode, setMode] = useState<ViewMode>("grid");

  const seasonUnlocked = !!space?.season_unlocked;
  // Nothing until the authors are known: every card would say "À toi" for a beat.
  const progressById = useMemo(() => {
    if (!reviewAuthors || !episodes) return undefined;
    const reviewers = reviewersOf(members);
    return new Map<string, ReviewProgress>(
      episodes.map((ep) => [ep.id, reviewProgress(ep, reviewAuthors.get(ep.id), reviewers, userId, seasonUnlocked)])
    );
  }, [reviewAuthors, episodes, members, userId, seasonUnlocked]);

  // Episodes come newest first, so the oldest one waiting is the last.
  const waiting = useMemo(
    () =>
      (episodes ?? []).filter((ep) => {
        const p = progressById?.get(ep.id);
        return !!p && p.myTurn && !p.revealed;
      }),
    [episodes, progressById]
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loader label="Chargement…" />
      </View>
    );
  }

  if (hasNoSpace || !space) {
    return (
      <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
        <SpaceSwitcher />
        <NoSpaceState
          icon={<Sparkles size={30} color={colors.primary} />}
          title="Aucun espace pour l'instant"
          subtitle="Crée ta première aventure partagée, ou rejoins celle d'un proche avec un code d'invitation."
        />
      </Screen>
    );
  }

  const status = getSeasonStatus(space);
  const owner = isOwner(space.membership);
  const participate = canParticipate(space.membership);
  const oldestWaiting = waiting[waiting.length - 1];

  const openEpisode = (episodeId: string) => router.push({ pathname: "/episode/[episodeId]", params: { episodeId } });
  const create = () => router.push({ pathname: "/create-episode/[spaceId]", params: { spaceId } });
  const openMembers = () => router.push({ pathname: "/space-members/[spaceId]", params: { spaceId } });

  return (
    <Screen
      scroll
      contentStyle={{ paddingHorizontal: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <SpaceSwitcher />

      <View style={{ gap: spacing.md }}>
        {/* The cover only when there is a real photo: an empty gradient pushed
            the episodes below the fold, and the name is already in the header. */}
        {space.cover_url ? (
          <FadeIn>
            <View style={[{ height: 150, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, shadows.poster]}>
              <Image source={{ uri: space.cover_url }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" transition={250} />
              {space.description ? (
                <>
                  <LinearGradient colors={["transparent", "rgba(8,8,9,0.85)"]} locations={[0.45, 1]} style={{ position: "absolute", width: "100%", height: "100%" }} />
                  <AppText numberOfLines={1} style={{ position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md, color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontWeight: "500" }}>
                    {space.description}
                  </AppText>
                </>
              ) : null}
            </View>
          </FadeIn>
        ) : null}

        {/* Season, group and settings in one compact band. */}
        <FadeIn delay={40}>
          <Card style={{ gap: spacing.md, paddingVertical: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText style={{ fontWeight: "700", fontSize: 14.5, color: colors.text }}>{seasonLine(status)}</AppText>
                {space.season_start && space.season_end ? (
                  <AppText variant="caption">
                    {formatDateShort(space.season_start)} → {formatDateShort(space.season_end)}
                  </AppText>
                ) : null}
              </View>
              {owner ? (
                <IconButton
                  icon={<Settings size={17} color={colors.text} />}
                  onPress={() => router.push({ pathname: "/space-settings/[spaceId]", params: { spaceId } })}
                  size={36}
                  accessibilityLabel="Réglages de l'espace"
                />
              ) : null}
            </View>

            <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: radius.pill, overflow: "hidden" }}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(4, status.progress * 100)}%`, height: "100%" }} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <PressableScale
                onPress={openMembers}
                scaleTo={0.96}
                accessibilityRole="button"
                accessibilityLabel={`${members?.length ?? 0} membres. Gérer les membres`}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <AvatarStack profiles={(members ?? []).map((m) => m.profile)} size={28} />
                <ChevronRight size={16} color={colors.textFaint} />
              </PressableScale>
              {status.state !== "unlocked" && status.state !== "ended" ? (
                <Button title="Aperçu du bilan ›" variant="ghost" size="sm" onPress={() => router.push("/recap")} />
              ) : null}
            </View>

            {status.state === "unlocked" ? (
              <Button title="Voir le bilan de la saison" variant="gold" icon={<Sparkles size={18} color="#1A1607" />} onPress={() => router.push("/recap")} />
            ) : status.state === "ended" ? (
              owner ? (
                <Pulse>
                  <Button title="Débloquer la saison" icon={<Lock size={18} color={colors.primaryFg} />} onPress={() => router.push("/recap")} fullWidth />
                </Pulse>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 4 }}>
                  <Lock size={15} color={colors.textMuted} />
                  <AppText variant="bodyMuted">En attente du déverrouillage par le propriétaire</AppText>
                </View>
              )
            ) : null}
          </Card>
        </FadeIn>

        {oldestWaiting ? (
          <ReviewWaitingBanner
            title={oldestWaiting.title}
            others={waiting.length - 1}
            onPress={() => router.push({ pathname: "/review/[episodeId]", params: { episodeId: oldestWaiting.id } })}
          />
        ) : null}
      </View>

      {/* Episodes */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader
          title={`Vos épisodes${episodes && episodes.length > 0 ? ` · ${episodes.length}` : ""}`}
          action={episodes && episodes.length > 0 ? <ModeToggle mode={mode} onChange={setMode} /> : undefined}
        />

        {episodesLoading ? (
          <Loader label="Chargement des épisodes…" />
        ) : !episodes || episodes.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={30} color={colors.primary} />}
            title="Pas encore d'épisode"
            subtitle={participate ? "Immortalise votre premier moment ensemble — ajoute des photos, un lieu, des tags." : "Les épisodes apparaîtront ici dès qu'un membre en créera un."}
            actionLabel={participate ? "Créer un épisode" : undefined}
            onAction={participate ? create : undefined}
          />
        ) : mode === "grid" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {episodes.map((ep, i) => (
              <EpisodePoster key={ep.id} episode={ep} progress={progressById?.get(ep.id)} width={CARD_WIDTH} index={i} onPress={() => openEpisode(ep.id)} />
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {episodes.map((ep, i) => (
              <EpisodeRow key={ep.id} episode={ep} progress={progressById?.get(ep.id)} index={i} onPress={() => openEpisode(ep.id)} />
            ))}
          </View>
        )}

        {participate && episodes && episodes.length > 0 ? (
          <Button
            title="Nouvel épisode"
            icon={<Plus size={18} color={colors.primaryFg} />}
            onPress={create}
            style={{ marginTop: spacing.xl }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

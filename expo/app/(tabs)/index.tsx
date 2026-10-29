import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Clapperboard, LayoutGrid, Lightbulb, Lock, Plus, Rows3, Settings, Sparkles, Users } from "lucide-react-native";
import React, { useState } from "react";
import { Dimensions, RefreshControl, View } from "react-native";
import { EpisodePoster, EpisodeRow } from "@/components/EpisodeCard";
import { NoSpaceState } from "@/components/NoSpaceState";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, Screen, SectionHeader } from "@/components/ui/Card";
import { EmptyState, Loader } from "@/components/ui/Feedback";
import { FadeIn, PressableScale, Pulse } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, shadows, spacing } from "@/constants/theme";
import { formatDate, getSeasonStatus } from "@/lib/format";
import { canParticipate, isOwner } from "@/lib/types";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useMembers } from "@/hooks/useMembers";
import { useIdeas } from "@/hooks/useSocial";
import { useActiveSpace } from "@/providers/activeSpace";

type ViewMode = "grid" | "timeline";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2;

function StatTile({ label, value, icon, onPress, hint }: { label: string; value: number; icon: React.ReactNode; onPress?: () => void; hint?: string }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={onPress ? 0.95 : 1}
      // Only a tile that goes somewhere is announced as a button.
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={hint ? `${value} ${label}. ${hint}` : `${value} ${label}`}
      style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: "center", gap: 4 }}
    >
      {icon}
      <AppText style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>{value}</AppText>
      <AppText variant="caption">{label}</AppText>
    </PressableScale>
  );
}

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

export default function MomentsScreen() {
  const router = useRouter();
  const { space, isLoading, hasNoSpace, refetch, isRefetching } = useActiveSpace();
  const spaceId = space?.id ?? "";

  const { data: episodes, isLoading: episodesLoading } = useEpisodes(spaceId);
  const { data: members } = useMembers(spaceId);
  const { data: ideas } = useIdeas(spaceId);
  const [mode, setMode] = useState<ViewMode>("grid");

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

  const openEpisode = (episodeId: string) => router.push({ pathname: "/episode/[episodeId]", params: { episodeId } });
  const create = () => router.push({ pathname: "/create-episode/[spaceId]", params: { spaceId } });

  return (
    <Screen
      scroll
      contentStyle={{ paddingHorizontal: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <SpaceSwitcher />

      {/* Poster hero — the cinematic anchor, now sitting under a permanent header
          instead of being a full-bleed image the tab bar had to fight with. */}
      <FadeIn>
        <View style={[{ height: 190, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, shadows.poster]}>
          {space.cover_url ? (
            <Image source={{ uri: space.cover_url }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" transition={250} />
          ) : (
            <LinearGradient colors={[colors.heroFrom, colors.heroTo]} style={{ position: "absolute", width: "100%", height: "100%" }} />
          )}
          <LinearGradient colors={["rgba(8,8,9,0.05)", "rgba(8,8,9,0.45)", "rgba(8,8,9,0.92)"]} locations={[0, 0.5, 1]} style={{ position: "absolute", width: "100%", height: "100%" }} />

          <View style={{ position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            {status.state === "unlocked" ? (
              <Badge label="Saison débloquée" tone="gold" icon={<Sparkles size={12} color={colors.accent} />} />
            ) : (
              <Badge label={status.label} tone={status.state === "ending" || status.state === "ended" ? "primary" : "muted"} />
            )}
            {owner ? (
              <IconButton
                icon={<Settings size={18} color="#fff" />}
                onPress={() => router.push({ pathname: "/space-settings/[spaceId]", params: { spaceId } })}
                size={38}
                style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                accessibilityLabel="Réglages de l'espace"
              />
            ) : null}
          </View>

          <View style={{ position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md, gap: 3 }}>
            <AppText variant="h2" numberOfLines={1} style={{ color: "#fff" }}>{space.name}</AppText>
            {space.description ? (
              <AppText numberOfLines={1} style={{ color: "rgba(255,255,255,0.75)", fontSize: 13.5, fontWeight: "500" }}>{space.description}</AppText>
            ) : null}
          </View>
        </View>
      </FadeIn>

      {/* Season */}
      <FadeIn delay={60}>
        <Card elevated style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="overline">Saison</AppText>
            <AppText variant="caption">
              {space.season_start ? formatDate(space.season_start) : "—"} → {space.season_end ? formatDate(space.season_end) : "—"}
            </AppText>
          </View>

          <View style={{ height: 7, backgroundColor: colors.surface, borderRadius: radius.pill, overflow: "hidden" }}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(4, status.progress * 100)}%`, height: "100%" }} />
          </View>

          {status.state === "unlocked" ? (
            <Button title="Voir le bilan de la saison" variant="gold" icon={<Sparkles size={18} color="#1A1607" />} onPress={() => router.push("/recap")} />
          ) : status.state === "ended" ? (
            owner ? (
              <Pulse>
                <Button title="Débloquer la saison" icon={<Lock size={18} color={colors.primaryFg} />} onPress={() => router.push("/recap")} fullWidth />
              </Pulse>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 6 }}>
                <Lock size={15} color={colors.textMuted} />
                <AppText variant="bodyMuted">En attente du déverrouillage par le propriétaire</AppText>
              </View>
            )
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText variant="bodyMuted">{status.daysLeft !== null ? `${status.daysLeft} j avant la fin de la saison` : "Saison en cours"}</AppText>
              <Button title="Aperçu du bilan" variant="ghost" size="sm" onPress={() => router.push("/recap")} />
            </View>
          )}
        </Card>
      </FadeIn>

      {/* Stats */}
      <FadeIn delay={110}>
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
          <StatTile label="Épisodes" value={episodes?.length ?? 0} icon={<Clapperboard size={18} color={colors.primary} />} />
          <StatTile label="Membres" value={members?.length ?? 0} icon={<Users size={18} color={colors.accent} />} hint="Gérer les membres" onPress={() => router.push({ pathname: "/space-members/[spaceId]", params: { spaceId } })} />
          <StatTile label="Idées" value={ideas?.length ?? 0} icon={<Lightbulb size={18} color="#5B8DEF" />} hint="Ouvrir les idées" onPress={() => router.push("/ideas")} />
        </View>
      </FadeIn>

      {/* Episodes */}
      <View style={{ marginTop: spacing.xxl }}>
        <SectionHeader
          title="Vos épisodes"
          subtitle="Les moments que vous avez vécus"
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
              <EpisodePoster key={ep.id} episode={ep} width={CARD_WIDTH} index={i} onPress={() => openEpisode(ep.id)} />
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {episodes.map((ep, i) => (
              <EpisodeRow key={ep.id} episode={ep} index={i} onPress={() => openEpisode(ep.id)} />
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

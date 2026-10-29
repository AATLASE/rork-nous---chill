import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Clapperboard, Film, Lock, Share2, Sparkles, Users } from "lucide-react-native";
import React from "react";
import { RefreshControl, Share, View } from "react-native";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { InlineVideo } from "@/components/VideoSurface";
import { Button } from "@/components/ui/Button";
import { Card, Screen, SectionHeader } from "@/components/ui/Card";
import { NoSpaceState } from "@/components/NoSpaceState";
import { Loader } from "@/components/ui/Feedback";
import { FadeIn, Pulse } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { formatDate, getSeasonStatus } from "@/lib/format";
import type { Synthese } from "@/lib/types";
import { isOwner } from "@/lib/types";
import { confirmAction } from "@/lib/confirm";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useMembers } from "@/hooks/useMembers";
import { useSynthese } from "@/hooks/useProfile";
import { useUpdateSpace } from "@/hooks/useSpaces";
import { useActiveSpace } from "@/providers/activeSpace";
import { useToast } from "@/providers/toast";

function extractSummary(synthese: Synthese | null | undefined): string | null {
  if (!synthese) return null;
  const skip = new Set(["id", "space_id", "video_url", "created_at", "updated_at"]);
  for (const [key, value] of Object.entries(synthese)) {
    if (skip.has(key)) continue;
    if (typeof value === "string" && value.trim().length > 20) return value.trim();
  }
  return null;
}

// The souvenir is edited elsewhere and comes back in whatever shape it was cut
// — portrait as often as not. InlineVideo sizes its box to the clip instead of
// forcing a 16:9 frame around it.
function SouvenirVideo({ url }: { url: string }) {
  return <InlineVideo url={url} style={{ borderRadius: radius.lg }} />;
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: spacing.lg }}>
      {icon}
      <AppText style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>{value}</AppText>
      <AppText variant="caption">{label}</AppText>
    </Card>
  );
}

export default function RecapScreen() {
  const router = useRouter();
  const toast = useToast();

  const { space, isLoading, hasNoSpace, refetch, isRefetching } = useActiveSpace();
  const spaceId = space?.id ?? "";

  const { data: episodes } = useEpisodes(spaceId);
  const { data: members } = useMembers(spaceId);
  const unlocked = !!space?.season_unlocked;
  const { data: synthese } = useSynthese(spaceId, unlocked);
  const updateSpace = useUpdateSpace();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loader label="Chargement du bilan…" />
      </View>
    );
  }

  if (hasNoSpace || !space) {
    return (
      <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
        <SpaceSwitcher />
        <NoSpaceState
          icon={<Sparkles size={30} color={colors.primary} />}
          title="Aucun espace"
          subtitle="Le bilan de saison apparaîtra ici une fois que tu feras partie d'un espace."
        />
      </Screen>
    );
  }

  const status = getSeasonStatus(space);
  const owner = isOwner(space.membership);

  const onUnlock = () => {
    confirmAction(
      "Débloquer la saison ?",
      "Les épisodes où tout le monde a répondu se sont déjà révélés tout seuls. Débloquer la saison force les autres : les reviews encore scellées seront montrées au groupe, même incomplètes 🎬",
      "Débloquer",
      async () => {
        try {
          await updateSpace.mutateAsync({ spaceId, patch: { season_unlocked: true } });
          toast.success("Saison débloquée 🎉");
        } catch (e) {
          toast.error(friendlyError(e));
        }
      },
    );
  };

  const shareRecap = async () => {
    await Share.share({ message: `On vient de débloquer le bilan de « ${space.name} » sur Gather 🎬✨` });
  };

  const summary = extractSummary(synthese);

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
      <SpaceSwitcher />

      <SectionHeader title="Bilan de saison" subtitle="Ce que chacun a pensé, révélé d'un coup" />

      {!unlocked ? (
        <FadeIn>
          <View style={{ borderRadius: radius.xxl, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
            <LinearGradient colors={["#2A0E13", "#16100F"]} style={{ padding: spacing.xl, alignItems: "center", gap: spacing.lg }}>
              <Pulse>
                <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary }}>
                  <Lock size={42} color={colors.primary} />
                </View>
              </Pulse>

              <View style={{ alignItems: "center", gap: 6 }}>
                <AppText variant="h2" center>Le bilan est scellé</AppText>
                <AppText variant="bodyMuted" center style={{ maxWidth: 320 }}>
                  {status.daysLeft && status.daysLeft > 0
                    ? `Encore ${status.daysLeft} jour${status.daysLeft > 1 ? "s" : ""} de saison. Chaque épisode se révèle de son côté quand tout le monde a publié sa review — le bilan, lui, attend la fin.`
                    : "La saison touche à sa fin. Place au grand moment de vérité."}
                </AppText>
              </View>

              {status.daysLeft !== null ? (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <AppText style={{ fontSize: 56, fontWeight: "800", color: "#fff", letterSpacing: -2 }}>{status.daysLeft}</AppText>
                  <AppText variant="h3" style={{ color: colors.textMuted }}>jours</AppText>
                </View>
              ) : null}

              {space.season_end ? <AppText variant="caption">Fin prévue le {formatDate(space.season_end)}</AppText> : null}
            </LinearGradient>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            {owner ? (
              <Button title="Débloquer la saison maintenant" icon={<Sparkles size={18} color={colors.primaryFg} />} onPress={onUnlock} loading={updateSpace.isPending} size="lg" />
            ) : (
              <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Lock size={18} color={colors.textMuted} />
                <AppText variant="bodyMuted" style={{ flex: 1 }}>Seul le propriétaire peut débloquer la saison. Patience, le grand moment approche !</AppText>
              </Card>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
            <StatBox label="Épisodes" value={episodes?.length ?? 0} icon={<Clapperboard size={18} color={colors.primary} />} />
            <StatBox label="Membres" value={members?.length ?? 0} icon={<Users size={18} color={colors.accent} />} />
          </View>
        </FadeIn>
      ) : (
        <FadeIn>
          <View style={{ gap: spacing.xxl }}>
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={36} color={colors.accent} />
              </View>
              <AppText variant="h2" center>Saison révélée ✨</AppText>
              <AppText variant="bodyMuted" center style={{ maxWidth: 320 }}>Toutes les reviews sont désormais visibles. Replongez dans vos épisodes pour les découvrir.</AppText>
            </View>

            {synthese?.video_url ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="overline">Votre vidéo souvenir</AppText>
                <SouvenirVideo url={synthese.video_url} />
              </View>
            ) : null}

            {summary ? (
              <Card elevated style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Film size={16} color={colors.accent} />
                  <AppText variant="overline">La synthèse de votre saison</AppText>
                </View>
                <AppText variant="body" style={{ lineHeight: 23 }}>{summary}</AppText>
              </Card>
            ) : !synthese?.video_url ? (
              // Nothing produces the summary or the video yet: say so, instead of
              // promising them "sous peu".
              <Card style={{ alignItems: "center", gap: 6 }}>
                <Film size={22} color={colors.textMuted} />
                <AppText variant="overline">Bientôt disponible</AppText>
                <AppText variant="bodyMuted" center>
                  La synthèse écrite et la vidéo souvenir de votre saison arrivent dans une prochaine version de Gather.
                </AppText>
              </Card>
            ) : null}

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatBox label="Épisodes" value={episodes?.length ?? 0} icon={<Clapperboard size={18} color={colors.primary} />} />
              <StatBox label="Membres" value={members?.length ?? 0} icon={<Users size={18} color={colors.accent} />} />
            </View>

            <View style={{ gap: spacing.md }}>
              <Button title="Revoir les épisodes" variant="secondary" icon={<Clapperboard size={18} color={colors.text} />} onPress={() => router.push("/")} />
              <Button title="Partager le bilan" variant="gold" icon={<Share2 size={18} color="#1A1607" />} onPress={shareRecap} />
            </View>
          </View>
        </FadeIn>
      )}
    </Screen>
  );
}

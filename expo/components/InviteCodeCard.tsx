import * as Clipboard from "expo-clipboard";
import { Copy, Eye, RefreshCw, Share2, Users } from "lucide-react-native";
import { ActivityIndicator, Share, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, Divider } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { useRegenerateInviteCode, useSpaceInviteCode } from "@/hooks/useMembers";
import { confirmAction } from "@/lib/confirm";
import { friendlyError } from "@/lib/errors";
import { inviteLink } from "@/lib/pendingInvite";
import type { InviteRole } from "@/lib/types";
import { useToast } from "@/providers/toast";

/** What each code gives, said the same way on the card and in the shared message. */
export const INVITE_COPY: Record<InviteRole, { title: string; explanation: string; shareLine: string }> = {
  observer: {
    title: "Lien observateur",
    explanation:
      "Pour suivre l'aventure : voir les épisodes, les photos et les reviews une fois révélées. Idéal pour la famille ou les proches.",
    shareLine: "Tu pourras suivre nos épisodes et nos reviews une fois révélées.",
  },
  member: {
    title: "Lien participant",
    explanation:
      "Pour vivre l'aventure : créer des épisodes et écrire sa review. Un épisode ne se révèle que quand tous les participants ont répondu, donc à réserver à ceux qui joueront le jeu.",
    shareLine: "Tu pourras créer des épisodes et écrire tes reviews avec nous.",
  },
};

/**
 * One of the space's two invite codes: observer or participant. Each one is an
 * address to share with everyone of that kind rather than a ticket per person;
 * regenerating it invalidates the previous code of that role only.
 */
export function InviteCodeCard({ spaceId, spaceName, role }: { spaceId: string; spaceName: string; role: InviteRole }) {
  const toast = useToast();
  const { data: invite, isLoading, error } = useSpaceInviteCode(spaceId, role);
  const regenerate = useRegenerateInviteCode(spaceId, role);
  const copyText = INVITE_COPY[role];

  const code = invite?.code ?? null;
  const arrivals = invite?.use_count ?? 0;
  const link = code ? inviteLink(code) : null;

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    toast.success("Lien copié");
  };

  const share = async () => {
    if (!code) return;
    await Share.share({
      message: `Rejoins « ${spaceName} » sur Gather 🎬\n${copyText.shareLine}\n${link}\n(ou code : ${code})`,
    });
  };

  const confirmRegenerate = () => {
    confirmAction(
      `Régénérer le ${copyText.title.toLowerCase()} ?`,
      "L'ancien lien et son code cesseront immédiatement de fonctionner. Les membres déjà présents gardent leur accès.",
      "Régénérer",
      () =>
        regenerate.mutate(undefined, {
          onSuccess: () => toast.success("Nouveau lien généré"),
          onError: (e) => toast.error(friendlyError(e)),
        }),
    );
  };

  const Icon = role === "member" ? Users : Eye;

  return (
    <Card elevated glow={role === "member"} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Icon size={18} color={role === "member" ? colors.primary : colors.textMuted} />
        <AppText variant="h3">{copyText.title}</AppText>
      </View>
      <AppText variant="bodyMuted">{copyText.explanation}</AppText>

      <View style={{ alignItems: "center", paddingVertical: spacing.xs }}>
        {code ? (
          <AppText style={{ fontSize: 28, fontWeight: "800", letterSpacing: 5, color: colors.text }}>{code}</AppText>
        ) : (
          <View style={{ height: 36, justifyContent: "center" }}>
            {isLoading || regenerate.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <AppText variant="bodyMuted">Code indisponible</AppText>
            )}
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button title="Copier le lien" variant="secondary" icon={<Copy size={17} color={colors.text} />} onPress={copy} disabled={!code} style={{ flex: 1 }} />
        <Button
          title="Partager"
          variant={role === "member" ? "primary" : "secondary"}
          icon={<Share2 size={17} color={role === "member" ? colors.primaryFg : colors.text} />}
          onPress={share}
          disabled={!code}
          style={{ flex: 1 }}
        />
      </View>

      <Divider />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <AppText variant="caption" style={{ flex: 1 }}>
          {invite ? `${arrivals} arrivée${arrivals > 1 ? "s" : ""} via ce lien` : error ? friendlyError(error) : " "}
        </AppText>
        <TouchableOpacity
          onPress={confirmRegenerate}
          disabled={regenerate.isPending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Régénérer le ${copyText.title.toLowerCase()}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={14} color={colors.textMuted} />
          <AppText style={{ color: colors.textMuted, fontWeight: "700", fontSize: 13 }}>Régénérer</AppText>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

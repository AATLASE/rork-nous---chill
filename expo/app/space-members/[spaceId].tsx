import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import { RefreshControl, Switch, TouchableOpacity, View } from "react-native";
import { InviteCodeCard } from "@/components/InviteCodeCard";
import { Avatar } from "@/components/ui/Avatar";
import { RoleBadge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Card, Divider, Screen, SectionHeader } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Feedback";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { canParticipate, effectiveRole, isOwner, type SpaceMember } from "@/lib/types";
import { confirmAction } from "@/lib/confirm";
import { useMembers, useRemoveMember, useUpdateMember } from "@/hooks/useMembers";
import { useSpace } from "@/hooks/useSpaces";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

export default function MembersScreen() {
  const { spaceId: id } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { userId } = useAuth();
  const { data: space } = useSpace(id);
  const owner = isOwner(space?.membership);

  const { data: members, isLoading, refetch, isRefetching } = useMembers(id);
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();

  const togglePromotion = (memberUserId: string, currentlyParticipating: boolean) => {
    updateMember.mutate(
      {
        spaceId: id,
        userId: memberUserId,
        patch: currentlyParticipating ? { can_create_episodes: false } : { role: "member", can_create_episodes: true },
      },
      { onError: (e) => toast.error(friendlyError(e)) }
    );
  };

  const confirmRemove = (memberUserId: string, name: string) => {
    confirmAction("Retirer ce membre ?", `${name} n'aura plus accès à cet espace.`, "Retirer", () =>
      removeMember.mutate({ spaceId: id, userId: memberUserId }, { onError: (e) => toast.error(friendlyError(e)) })
    );
  };

  const all = members ?? [];
  const pending = all.filter((m) => m.role !== "owner" && !canParticipate(m));
  const active = all.filter((m) => m.role === "owner" || canParticipate(m));

  const renderMember = (member: SpaceMember) => {
    const isMe = member.user_id === userId;
    const memberIsOwner = member.role === "owner";
    const participating = canParticipate(member);
    return (
      <Card style={{ gap: owner && !memberIsOwner ? spacing.md : 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Avatar profile={member.profile} size={44} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText variant="h3" numberOfLines={1}>{member.profile?.name ?? "Membre"}</AppText>
              {isMe ? <AppText variant="caption" style={{ color: colors.primary }}>· toi</AppText> : null}
            </View>
            <View style={{ marginTop: 4, flexDirection: "row" }}>
              <RoleBadge role={effectiveRole(member)} />
            </View>
          </View>
          {owner && !memberIsOwner ? (
            <TouchableOpacity
              onPress={() => confirmRemove(member.user_id, member.profile?.name ?? "Ce membre")}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${member.profile?.name ?? "ce membre"} de l'espace`}
            >
              <Trash2 size={17} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>

        {owner && !memberIsOwner ? (
          <>
            <Divider />
            {/* Phrased as an authorisation the owner grants, not as an
                opaque capability flag: the "off" state is the one that
                needs explaining, so it says what the person is missing. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
                backgroundColor: participating ? "transparent" : colors.primarySoft,
                borderRadius: radius.md,
                marginHorizontal: participating ? 0 : -spacing.sm,
                paddingHorizontal: participating ? 0 : spacing.sm,
                paddingVertical: participating ? 0 : spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: "600", fontSize: 14, color: colors.text }}>
                  {participating ? "Peut participer" : "Autoriser à participer"}
                </AppText>
                <AppText variant="caption">
                  {participating
                    ? "Crée des épisodes et écrit ses impressions"
                    : `Pour l'instant, ${member.profile?.name ?? "cette personne"} voit l'espace et commente les épisodes révélés`}
                </AppText>
              </View>
              <Switch
                value={participating}
                onValueChange={() => togglePromotion(member.user_id, participating)}
                trackColor={{ false: colors.surface, true: colors.primary }}
                thumbColor="#fff"
                ios_backgroundColor={colors.surface}
                accessibilityLabel={`Autoriser ${member.profile?.name ?? "ce membre"} à participer`}
              />
            </View>
          </>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.sm, marginBottom: spacing.lg }}>
        <IconButton
          icon={<ChevronLeft size={22} color={colors.text} />}
          variant="secondary"
          size={40}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
          accessibilityLabel="Retour"
        />
        <View style={{ flex: 1 }}>
          <AppText variant="title">Membres</AppText>
          <AppText variant="caption">{members?.length ?? 0} personne{(members?.length ?? 0) > 1 ? "s" : ""} dans l&apos;aventure</AppText>
        </View>
      </View>

      {owner ? (
        <FadeIn>
          <View style={{ marginBottom: spacing.xxl }}>
            <SectionHeader title="Inviter" subtitle="Deux liens, selon ce que tu veux que la personne puisse faire" />
            <View style={{ gap: spacing.md }}>
              <InviteCodeCard spaceId={id} spaceName={space?.name ?? "notre espace"} role="member" />
              <InviteCodeCard spaceId={id} spaceName={space?.name ?? "notre espace"} role="observer" />
            </View>
          </View>
        </FadeIn>
      ) : null}

      {isLoading ? (
        <Loader label="Chargement des membres…" />
      ) : (
        <>
          {/* The arrivals waiting for a green light used to be announced by a card
              on the home screen. They belong here instead — one screen where you
              see who is waiting and grant it, rather than a banner elsewhere that
              only sends you here. Owners get them split out on top; everybody
              else reads one plain list. */}
          {owner && pending.length > 0 ? (
            <View style={{ marginBottom: spacing.xxl }}>
              <SectionHeader
                title="En attente de ton feu vert"
                subtitle={`${pending.length} personne${pending.length > 1 ? "s" : ""} ${pending.length > 1 ? "ont" : "a"} rejoint l'espace mais ne peu${pending.length > 1 ? "vent" : "t"} pas encore participer`}
              />
              <View style={{ gap: spacing.md }}>
                {pending.map((member, i) => (
                  <FadeIn key={member.user_id} delay={i * 40}>
                    {renderMember(member)}
                  </FadeIn>
                ))}
              </View>
            </View>
          ) : null}

          {owner && pending.length > 0 && active.length > 0 ? (
            <SectionHeader title="Participants" />
          ) : null}

          <View style={{ gap: spacing.md }}>
            {(owner ? active : all).map((member, i) => (
              <FadeIn key={member.user_id} delay={i * 40}>
                {renderMember(member)}
              </FadeIn>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

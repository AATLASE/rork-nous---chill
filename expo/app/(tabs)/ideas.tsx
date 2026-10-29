import { Flame, Lightbulb, Plus, Trash2, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { RefreshControl, TouchableOpacity, View } from "react-native";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, Screen, SectionHeader } from "@/components/ui/Card";
import { NoSpaceState } from "@/components/NoSpaceState";
import { EmptyState, Loader } from "@/components/ui/Feedback";
import { FadeIn, PressableScale } from "@/components/ui/motion";
import { Field, Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { canParticipate, isOwner } from "@/lib/types";
import { useCreateIdea, useDeleteIdea, useIdeas, useToggleIdeaVote } from "@/hooks/useSocial";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

export default function IdeasScreen() {
  const toast = useToast();
  const { userId } = useAuth();
  const { space, isLoading: spaceLoading, hasNoSpace } = useActiveSpace();
  const spaceId = space?.id ?? "";

  const { data: ideas, isLoading, refetch, isRefetching } = useIdeas(spaceId);
  const createIdea = useCreateIdea(spaceId);
  const toggleVote = useToggleIdeaVote(spaceId);
  const deleteIdea = useDeleteIdea(spaceId);

  const participate = canParticipate(space?.membership);
  const owner = isOwner(space?.membership);

  const [composing, setComposing] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const sorted = useMemo(
    () => [...(ideas ?? [])].sort((a, b) => b.voteCount - a.voteCount || (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    [ideas]
  );

  const submit = async () => {
    if (!title.trim()) {
      setTitleError("Donne un titre à ton idée.");
      return;
    }
    setTitleError(null);
    setSaving(true);
    try {
      await createIdea.mutateAsync({ title, description });
      setTitle("");
      setDescription("");
      setComposing(false);
      toast.success("Idée proposée 💡");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  if (spaceLoading) {
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
          icon={<Lightbulb size={30} color={colors.primary} />}
          title="Aucun espace"
          subtitle="Rejoins ou crée un espace pour proposer des idées de sorties."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
      <SpaceSwitcher />

      <SectionHeader
        title="Idées"
        subtitle="Vos prochaines sorties, votées ensemble"
        action={
          participate ? (
            <IconButton
              icon={composing ? <X size={22} color={colors.text} /> : <Plus size={22} color={colors.primaryFg} />}
              variant={composing ? "secondary" : "primary"}
              onPress={() => setComposing((v) => !v)}
              accessibilityLabel={composing ? "Annuler la proposition" : "Proposer une idée"}
            />
          ) : undefined
        }
      />

      {composing ? (
        <FadeIn>
          <Card elevated style={{ gap: spacing.md, marginBottom: spacing.xl }}>
            <Field label="Ton idée" error={titleError}>
              <Input
                placeholder="Escape game ce week-end ?"
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  if (titleError) setTitleError(null);
                }}
                invalid={!!titleError}
                autoFocus
              />
            </Field>
            <Field label="Détails (optionnel)">
              <Input placeholder="On peut réserver pour samedi soir…" value={description} onChangeText={setDescription} multiline />
            </Field>
            <Button title="Proposer au groupe" onPress={submit} loading={saving} />
          </Card>
        </FadeIn>
      ) : null}

      {isLoading ? (
        <Loader label="Chargement des idées…" />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={30} color={colors.primary} />}
          title="Aucune idée pour l'instant"
          subtitle={participate ? "Lance la première idée de sortie et laisse le groupe voter." : "Les idées proposées apparaîtront ici."}
          actionLabel={participate ? "Proposer une idée" : undefined}
          onAction={participate ? () => setComposing(true) : undefined}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {sorted.map((idea, i) => {
            const canDelete = owner || idea.proposed_by === userId;
            return (
              <FadeIn key={idea.id} delay={Math.min(i, 8) * 50}>
                <Card style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText variant="h3">{idea.title}</AppText>
                      {idea.description ? <AppText variant="bodyMuted">{idea.description}</AppText> : null}
                    </View>
                    {canDelete ? (
                      <TouchableOpacity
                        onPress={() => deleteIdea.mutate(idea.id)}
                        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer l'idée ${idea.title}`}
                      >
                        <Trash2 size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Avatar profile={idea.profile} size={24} />
                      <AppText variant="caption">{idea.profile?.name ?? "Membre"} · {formatRelative(idea.created_at)}</AppText>
                    </View>

                    <PressableScale
                      onPress={() => (participate ? toggleVote.mutate({ ideaId: idea.id, voted: idea.voted }) : toast.info("Seuls les membres peuvent voter."))}
                      accessibilityRole="button"
                      accessibilityLabel={`${idea.voteCount} vote${idea.voteCount > 1 ? "s" : ""}. ${idea.voted ? "Retirer mon vote" : "Voter pour cette idée"}`}
                      accessibilityState={{ selected: idea.voted }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: idea.voted ? colors.primary : colors.surface }}
                    >
                      <Flame size={15} color={idea.voted ? "#fff" : colors.textMuted} fill={idea.voted ? "#fff" : "transparent"} />
                      <AppText style={{ fontWeight: "700", fontSize: 13, color: idea.voted ? "#fff" : colors.textMuted }}>{idea.voteCount}</AppText>
                    </PressableScale>
                  </View>
                </Card>
              </FadeIn>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

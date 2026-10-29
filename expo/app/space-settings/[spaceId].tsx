import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, Film, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { CoverAdjustModal } from "@/components/CoverAdjustModal";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, Screen, SectionHeader } from "@/components/ui/Card";
import { DateField } from "@/components/ui/DateField";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { Loader } from "@/components/ui/Feedback";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { pickCoverImage, PickedAsset, uploadMedia } from "@/lib/media";
import { isOwner } from "@/lib/types";
import { confirmAction } from "@/lib/confirm";
import { useDeleteSpace, useSpace, useUpdateSpace } from "@/hooks/useSpaces";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

function toDateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export default function SpaceSettingsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { userId } = useAuth();
  const { data: space, isLoading } = useSpace(spaceId);
  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();

  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [newCover, setNewCover] = useState<PickedAsset | null>(null);
  const [pendingCover, setPendingCover] = useState<PickedAsset | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (space && !hydrated) {
      setName(space.name ?? "");
      setDescription(space.description ?? "");
      setStart(toDateOrNull(space.season_start));
      setEnd(toDateOrNull(space.season_end));
      setHydrated(true);
    }
  }, [space, hydrated]);

  if (isLoading || !space) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loader label="Chargement…" />
      </View>
    );
  }

  if (!isOwner(space.membership)) {
    return (
      <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
        <View style={{ alignItems: "flex-end", paddingTop: spacing.sm }}>
          <IconButton icon={<X size={20} color={colors.text} />} onPress={() => router.back()} size={40} accessibilityLabel="Fermer" />
        </View>
        <View style={{ alignItems: "center", marginTop: spacing.xxxl }}>
          <AppText variant="h2">Accès réservé</AppText>
          <AppText variant="bodyMuted" center style={{ marginTop: spacing.sm }}>Seul le propriétaire peut modifier cet espace.</AppText>
        </View>
      </Screen>
    );
  }

  const onPickCover = async () => {
    try {
      const asset = await pickCoverImage();
      if (asset) setPendingCover(asset);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Le nom ne peut pas être vide.");
      return;
    }
    setSaving(true);
    try {
      let coverUrl = space.cover_url;
      if (newCover) coverUrl = await uploadMedia({ kind: "covers", spaceId, userId }, newCover);
      await updateSpace.mutateAsync({
        spaceId,
        patch: {
          name: name.trim(),
          description: description.trim() || null,
          cover_url: coverUrl,
          season_start: start ? start.toISOString() : null,
          season_end: end ? end.toISOString() : null,
        },
      });
      toast.success("Espace mis à jour");
      router.back();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    confirmAction(
      "Supprimer l'espace ?",
      `« ${space.name} » et tout son contenu seront définitivement supprimés. Cette action est irréversible.`,
      "Supprimer",
      async () => {
        try {
          await deleteSpace.mutateAsync(spaceId);
          toast.success("Espace supprimé");
          router.replace("/");
        } catch (e) {
          toast.error(friendlyError(e));
        }
      },
    );
  };

  const coverPreview = newCover?.uri ?? space.cover_url;

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, marginBottom: spacing.lg }}>
        <AppText variant="title">Paramètres</AppText>
        <IconButton icon={<X size={20} color={colors.text} />} onPress={() => router.back()} size={40} accessibilityLabel="Fermer" />
      </View>

      <FadeIn>
        <TouchableOpacity activeOpacity={0.85} onPress={onPickCover} style={{ marginBottom: spacing.xl }}>
          <View style={{ height: 160, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.card, borderWidth: coverPreview ? 0 : 1.5, borderColor: colors.borderStrong, borderStyle: coverPreview ? "solid" : "dashed", alignItems: "center", justifyContent: "center" }}>
            {coverPreview ? (
              <>
                <Image source={{ uri: coverPreview }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
                <View style={{ position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill }}>
                  <Camera size={14} color="#fff" />
                  <AppText style={{ color: "#fff", fontSize: 12.5, fontWeight: "600" }}>Changer</AppText>
                </View>
              </>
            ) : (
              <View style={{ alignItems: "center", gap: 8 }}>
                <Film size={26} color={colors.textMuted} />
                <AppText variant="bodyMuted">Ajouter une couverture</AppText>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ gap: spacing.lg }}>
          <Field label="Nom de l'espace">
            <Input value={name} onChangeText={setName} />
          </Field>
          <Field label="Description">
            <Input value={description} onChangeText={setDescription} multiline placeholder="Décris votre aventure…" />
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <DateField label="Début de saison" value={start} onChange={setStart} />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="Fin de saison" value={end} onChange={setEnd} minimumDate={start ?? undefined} />
            </View>
          </View>
          <Button title="Enregistrer" size="lg" onPress={onSave} loading={saving} />
        </View>
      </FadeIn>

      <View style={{ marginTop: spacing.xxxl }}>
        <SectionHeader title="Zone de danger" />
        <Card style={{ borderColor: colors.destructiveSoft, gap: spacing.md }}>
          <AppText variant="bodyMuted">La suppression efface tous les épisodes, reviews et médias de cet espace.</AppText>
          <Button title="Supprimer l'espace" variant="destructive" icon={<Trash2 size={17} color="#fff" />} onPress={confirmDelete} loading={deleteSpace.isPending} />
        </Card>
      </View>

      <CoverAdjustModal
        asset={pendingCover}
        onCancel={() => setPendingCover(null)}
        onDone={(cropped) => {
          setNewCover(cropped);
          setPendingCover(null);
        }}
      />
    </Screen>
  );
}

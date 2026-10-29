import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera, Check, Film, Sparkles, X } from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { CoverAdjustModal } from "@/components/CoverAdjustModal";
import { InviteCodeCard } from "@/components/InviteCodeCard";
import { IconButton } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Screen } from "@/components/ui/Card";
import { DateField } from "@/components/ui/DateField";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { PickedAsset, pickCoverImage, uploadMedia } from "@/lib/media";
import type { Space } from "@/lib/types";
import { useCreateSpace, useUpdateSpace } from "@/hooks/useSpaces";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export default function CreateSpaceScreen() {
  const router = useRouter();
  const toast = useToast();
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();
  const { userId } = useAuth();
  const { select } = useActiveSpace();

  const [name, setName] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const [cover, setCover] = useState<PickedAsset | null>(null);
  const [pendingCover, setPendingCover] = useState<PickedAsset | null>(null);
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(addMonths(new Date(), 3));
  const [loading, setLoading] = useState<boolean>(false);

  const [created, setCreated] = useState<{ space: Space } | null>(null);

  const onPickCover = async () => {
    try {
      const asset = await pickCoverImage();
      if (asset) setPendingCover(asset);
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const onCreate = async () => {
    // Errors belong next to the field that caused them, not in a toast that may
    // pop far from where the user is looking on a long form.
    if (!name.trim()) {
      setNameError("Donne un nom à ton espace.");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setDateError("La fin de saison doit être après le début.");
      return;
    }
    setNameError(null);
    setDateError(null);
    setLoading(true);
    try {
      // The storage policy only accepts paths starting with a space uuid, so
      // the space is created first and the cover is uploaded under its id.
      const { space } = await createSpace.mutateAsync({
        name,
        description,
        coverUrl: null,
        seasonStart: start.toISOString(),
        seasonEnd: end.toISOString(),
      });

      if (cover) {
        try {
          const coverUrl = await uploadMedia({ kind: "covers", spaceId: space.id, userId }, cover);
          const updated = await updateSpace.mutateAsync({ spaceId: space.id, patch: { cover_url: coverUrl } });
          space.cover_url = updated.cover_url;
        } catch (coverError) {
          console.log("[create-space] cover upload failed:", coverError);
          toast.info("Espace créé, mais la couverture n'a pas pu être envoyée. Réessaie depuis les paramètres.");
        }
      }

      setCreated({ space });
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
        <View style={{ alignItems: "flex-end", paddingTop: spacing.sm }}>
          <IconButton icon={<X size={20} color={colors.text} />} onPress={() => router.back()} size={40} accessibilityLabel="Fermer" />
        </View>
        <FadeIn>
          <View style={{ alignItems: "center", gap: spacing.md, marginTop: spacing.lg }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={38} color={colors.primary} />
            </View>
            <AppText variant="title" center>« {created.space.name} » est prêt</AppText>
            <AppText variant="bodyMuted" center style={{ maxWidth: 300 }}>
              Invite ta bande avec le lien participant, et ceux qui veulent juste suivre avec le lien
              observateur. Tu les retrouveras dans Profil, rubrique Membres.
            </AppText>
          </View>
        </FadeIn>

        <FadeIn delay={120}>
          <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
            <InviteCodeCard spaceId={created.space.id} spaceName={created.space.name} role="member" />
            <InviteCodeCard spaceId={created.space.id} spaceName={created.space.name} role="observer" />
          </View>
        </FadeIn>

        <Button
          title="Ouvrir l'espace"
          size="lg"
          onPress={() => {
            select(created.space.id);
            router.replace("/");
          }}
          style={{ marginTop: spacing.xxl }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">Nouvel espace</AppText>
          <AppText variant="caption">Le groupe qui partagera ses moments</AppText>
        </View>
        <IconButton icon={<X size={20} color={colors.text} />} onPress={() => router.back()} size={40} accessibilityLabel="Fermer" />
      </View>

      <FadeIn>
        <TouchableOpacity activeOpacity={0.85} onPress={onPickCover} style={{ marginBottom: spacing.xl }}>
          <View
            style={{
              height: 170,
              borderRadius: radius.xl,
              borderWidth: cover ? 0 : 1.5,
              borderColor: colors.borderStrong,
              borderStyle: cover ? "solid" : "dashed",
              backgroundColor: colors.card,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {cover ? (
              <>
                <Image source={{ uri: cover.uri }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
                <View style={{ position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill }}>
                  <Camera size={14} color="#fff" />
                  <AppText style={{ color: "#fff", fontSize: 12.5, fontWeight: "600" }}>Changer</AppText>
                </View>
              </>
            ) : (
              <View style={{ alignItems: "center", gap: 8 }}>
                <Film size={28} color={colors.textMuted} />
                <AppText variant="bodyMuted">Ajouter une couverture</AppText>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </FadeIn>

      <FadeIn delay={80}>
        <View style={{ gap: spacing.lg }}>
          <Field label="Nom de l'espace" error={nameError}>
            <Input
              placeholder="Samuel & Mathilde — Saison 1"
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameError) setNameError(null);
              }}
              invalid={!!nameError}
              autoFocus
            />
          </Field>

          <Field label="Description (optionnel)">
            <Input
              placeholder="Notre première année à deux 🎬"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </Field>

          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Début de saison"
                  value={start}
                  onChange={(d) => {
                    setStart(d);
                    if (dateError) setDateError(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Fin de saison"
                  value={end}
                  onChange={(d) => {
                    setEnd(d);
                    if (dateError) setDateError(null);
                  }}
                  minimumDate={start}
                />
              </View>
            </View>
            {dateError ? (
              <AppText style={{ fontSize: 12.5, color: colors.destructive, fontWeight: "600" }}>{dateError}</AppText>
            ) : null}
          </View>

          <Badge label="Tu seras le propriétaire de cet espace" tone="gold" style={{ marginTop: spacing.xs }} />

          <Button title="Créer l'espace" size="lg" onPress={onCreate} loading={loading} icon={<Check size={18} color={colors.primaryFg} />} style={{ marginTop: spacing.sm }} />
        </View>
      </FadeIn>

      <CoverAdjustModal
        asset={pendingCover}
        onCancel={() => setPendingCover(null)}
        onDone={(cropped) => {
          setCover(cropped);
          setPendingCover(null);
        }}
      />
    </Screen>
  );
}

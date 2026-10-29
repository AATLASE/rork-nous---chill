import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Bell, Camera, ChevronRight, GraduationCap, Info, LogOut, Moon, Palette, Smartphone, Sun, Sunset, Users } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Platform, Switch, TouchableOpacity, View } from "react-native";
import { CoverAdjustModal } from "@/components/CoverAdjustModal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, Divider, Screen, SectionHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { PickedAsset, pickAvatarImage, uploadMedia } from "@/lib/media";
import { disablePush, enablePush, pushPermission, pushSupported } from "@/lib/push";
import { confirmAction } from "@/lib/confirm";
import { useUpdateProfile } from "@/hooks/useProfile";
import { useActiveSpace } from "@/providers/activeSpace";
import { useAuth } from "@/providers/auth";
import { ThemeMode, useThemeMode } from "@/providers/theme";
import { useToast } from "@/providers/toast";

function Row({
  icon,
  title,
  subtitle,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: "600", fontSize: 15, color: colors.text }}>{title}</AppText>
        <AppText variant="caption">{subtitle}</AppText>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function PushToggle() {
  const toast = useToast();
  const { userId } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    pushPermission()
      .then((p) => setEnabled(p === "granted"))
      .catch(() => {});
  }, []);

  const onToggle = async (value: boolean) => {
    if (!userId) return;

    // Turning it off is ours to do on the web — the browser lets a site drop its
    // own subscription — while iOS and Android only take that back in settings.
    if (!value) {
      await disablePush(userId);
      setEnabled(false);
      toast.info(Platform.OS === "web" ? "Notifications désactivées" : "Pour les désactiver, passe par les réglages système.");
      return;
    }

    if (pushSupported() === "unsupported") {
      toast.info(
        Platform.OS === "web"
          ? "Ce navigateur ne gère pas les notifications. Installe l'app depuis ton navigateur pour les recevoir."
          : "Les notifications demandent l'app installée, pas Expo Go.",
      );
      return;
    }

    try {
      const result = await enablePush(userId);
      setEnabled(result === "granted");
      if (result === "granted") {
        toast.success("Notifications activées");
      } else {
        toast.info(
          Platform.OS === "web"
            ? "Autorise les notifications dans les réglages du site."
            : "Active les notifications dans les réglages de ton téléphone.",
        );
      }
    } catch {
      toast.error("Impossible d'activer les notifications ici.");
    }
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <Bell size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: "600", fontSize: 15, color: colors.text }}>Notifications push</AppText>
        <AppText variant="caption">Épisodes, commentaires, déverrouillages</AppText>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.surface, true: colors.primary }}
        thumbColor="#fff"
        ios_backgroundColor={colors.surface}
        accessibilityLabel="Activer les notifications push"
      />
    </View>
  );
}

/**
 * The 8pm reminder, and its own switch.
 *
 * It is the only notification the app sends without anybody having done
 * anything — so it is the only one that needs to be refusable on its own.
 * Turning push off to escape it would also silence the replies to your own
 * comments, which is not what somebody means by "leave me alone at 8pm".
 */
function DailyPromptToggle() {
  const toast = useToast();
  const { profile } = useAuth();
  const updateProfile = useUpdateProfile();

  // The switch has to move under the thumb, not a round-trip later: `pending`
  // holds the value being written until the profile comes back saying so.
  const [pending, setPending] = useState<boolean | null>(null);
  // Undefined means a database that predates the column — on, like everyone.
  const enabled = pending ?? profile?.daily_prompt_enabled !== false;

  useEffect(() => {
    if (pending !== null && profile?.daily_prompt_enabled === pending) setPending(null);
  }, [profile?.daily_prompt_enabled, pending]);

  const onToggle = async (value: boolean) => {
    setPending(value);
    try {
      await updateProfile.mutateAsync({ daily_prompt_enabled: value });
      toast.success(value ? "Tu seras relancé à 20h" : "Plus de relance le soir");
    } catch (e) {
      setPending(null);
      toast.error(friendlyError(e));
    }
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <Sunset size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: "600", fontSize: 15, color: colors.text }}>Relance du soir</AppText>
        <AppText variant="caption">À 20h, « quelque chose à raconter aujourd&apos;hui ? »</AppText>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.surface, true: colors.primary }}
        thumbColor="#fff"
        ios_backgroundColor={colors.surface}
        accessibilityLabel="Recevoir la relance du soir"
      />
    </View>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Système", Icon: Smartphone },
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
];

function ThemeSelector() {
  const { mode, setMode } = useThemeMode();

  const onSelect = (next: ThemeMode) => {
    if (next === mode) return;
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setMode(next);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <Palette size={18} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: "600", fontSize: 15, color: colors.text }}>Thème</AppText>
          <AppText variant="caption">Suis ton téléphone, ou force clair / sombre</AppText>
        </View>
      </View>
      <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, gap: 4 }}>
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const selected = mode === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => onSelect(value)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Thème ${label}`}
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minHeight: 44,
                borderRadius: radius.sm,
                backgroundColor: selected ? colors.cardElevated : "transparent",
                borderWidth: 1,
                borderColor: selected ? colors.primary : "transparent",
              }}
            >
              <Icon size={15} color={selected ? colors.primary : colors.textMuted} />
              <AppText style={{ fontSize: 13, fontWeight: "700", color: selected ? colors.text : colors.textMuted }}>{label}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile, user, signOut } = useAuth();
  const updateProfile = useUpdateProfile();
  const { space, spaces } = useActiveSpace();

  const [name, setName] = useState<string>(profile?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [bio, setBio] = useState<string>(profile?.bio ?? "");
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [savingAvatar, setSavingAvatar] = useState<boolean>(false);
  const [pendingAvatar, setPendingAvatar] = useState<PickedAsset | null>(null);

  useEffect(() => {
    if (profile && !hydrated) {
      setName(profile.name ?? "");
      setBio(profile.bio ?? "");
      setHydrated(true);
    }
  }, [profile, hydrated]);

  const changed = name.trim() !== (profile?.name ?? "") || bio.trim() !== (profile?.bio ?? "");

  const onSave = async () => {
    if (!name.trim()) {
      setNameError("Ton prénom ne peut pas être vide.");
      return;
    }
    setNameError(null);
    try {
      await updateProfile.mutateAsync({ name: name.trim(), bio: bio.trim() || null });
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onChangeAvatar = async () => {
    try {
      const asset = await pickAvatarImage();
      if (asset) setPendingAvatar(asset);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onAvatarAdjusted = async (cropped: PickedAsset) => {
    setPendingAvatar(null);
    setSavingAvatar(true);
    try {
      const url = await uploadMedia(
        { kind: "avatars", spaceId: space?.id ?? null, userId: user?.id ?? null },
        cropped
      );
      await updateProfile.mutateAsync({ avatar_url: url });
      toast.success("Photo mise à jour");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSavingAvatar(false);
    }
  };

  const confirmSignOut = () => {
    confirmAction("Se déconnecter ?", "Tu pourras te reconnecter à tout moment.", "Se déconnecter", () => signOut());
  };

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <AppText variant="title">Profil</AppText>
      </View>

      <FadeIn>
        <Card elevated style={{ gap: spacing.lg }}>
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <TouchableOpacity
              onPress={onChangeAvatar}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Changer ma photo de profil"
            >
              <Avatar profile={profile} size={92} />
              <View style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card }}>
                <Camera size={15} color="#fff" />
              </View>
            </TouchableOpacity>
            {savingAvatar ? <AppText variant="caption">Envoi…</AppText> : <AppText variant="caption">{user?.email}</AppText>}
          </View>

          <Field label="Prénom" error={nameError}>
            <Input
              placeholder="Ton prénom"
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameError) setNameError(null);
              }}
              invalid={!!nameError}
            />
          </Field>
          <Field label="Bio (optionnel)">
            <Input placeholder="Quelques mots sur toi…" value={bio} onChangeText={setBio} multiline />
          </Field>
          <Button title="Enregistrer" onPress={onSave} loading={updateProfile.isPending} disabled={!changed} />
        </Card>
      </FadeIn>

      <View style={{ marginTop: spacing.xxl }}>
        <SectionHeader title="Espace" subtitle={space?.name ?? "Aucun espace actif"} />
        <Card style={{ gap: spacing.lg }}>
          <Row
            icon={<Users size={18} color={colors.text} />}
            title="Membres"
            subtitle={space ? "Voir qui partage l'aventure, gérer les accès" : "Rejoins un espace pour voir ses membres"}
            accessibilityLabel="Ouvrir les membres de l'espace"
            onPress={() =>
              space
                ? router.push({ pathname: "/space-members/[spaceId]", params: { spaceId: space.id } })
                : router.push("/join")
            }
          />
          <Divider />
          <Row
            icon={<GraduationCap size={18} color={colors.text} />}
            title="Revoir le didacticiel"
            subtitle="Le petit tour de bienvenue de Gather"
            accessibilityLabel="Revoir le didacticiel"
            onPress={() => router.push("/onboarding")}
          />
        </Card>
      </View>

      <View style={{ marginTop: spacing.xxl }}>
        <SectionHeader title="Préférences" />
        <Card style={{ gap: spacing.lg }}>
          <ThemeSelector />
          <Divider />
          <PushToggle />
          <Divider />
          <DailyPromptToggle />
        </Card>
      </View>

      <View style={{ marginTop: spacing.xxl }}>
        <SectionHeader title="À propos" />
        <Card padded={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <Info size={18} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontWeight: "600", fontSize: 15, color: colors.text }}>Gather</AppText>
              <AppText variant="caption">{spaces.length} espace{spaces.length > 1 ? "s" : ""}</AppText>
            </View>
            <AppText variant="caption">v1.0.0</AppText>
          </View>
        </Card>
      </View>

      <TouchableOpacity
        onPress={confirmSignOut}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.xxl, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.destructiveSoft }}
      >
        <LogOut size={18} color={colors.destructive} />
        <AppText style={{ color: colors.destructive, fontWeight: "700" }}>Se déconnecter</AppText>
      </TouchableOpacity>

      <CoverAdjustModal
        asset={pendingAvatar}
        title="Ajuster ta photo"
        shape="circle"
        onCancel={() => setPendingAvatar(null)}
        onDone={onAvatarAdjusted}
      />
    </Screen>
  );
}

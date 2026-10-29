import { useLocalSearchParams, useRouter } from "expo-router";
import { Ticket, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { IconButton } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { Card, Screen } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { clearPendingInvite } from "@/lib/pendingInvite";
import { joinMessage, useJoinSpace } from "@/hooks/useSpaces";
import { useActiveSpace } from "@/providers/activeSpace";
import { useToast } from "@/providers/toast";

export default function JoinScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string }>();
  const joinSpace = useJoinSpace();
  const { select } = useActiveSpace();

  const [code, setCode] = useState<string>(params.code ?? "");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const onJoin = async () => {
    if (!code.trim()) {
      setCodeError("Saisis un code d'invitation.");
      return;
    }
    setCodeError(null);
    setLoading(true);
    try {
      const result = await joinSpace.mutateAsync(code);
      await clearPendingInvite();
      // Make the space we just joined the one the tabs show.
      select(result.spaceId);
      // Sets expectations before the space dashboard explains the role in full.
      toast.success(joinMessage(result));
      router.replace("/");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: spacing.lg }}>
      <View style={{ alignItems: "flex-end", paddingTop: spacing.sm }}>
        <IconButton icon={<X size={20} color={colors.text} />} onPress={() => router.back()} size={40} accessibilityLabel="Fermer" />
      </View>

      <FadeIn>
        <View style={{ alignItems: "center", gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <Ticket size={36} color={colors.primary} />
          </View>
          <AppText variant="title" center>Rejoindre un espace</AppText>
          <AppText variant="bodyMuted" center style={{ maxWidth: 300 }}>
            Entre le code de l&apos;espace que t&apos;a partagé un membre de l&apos;aventure.
          </AppText>
        </View>
      </FadeIn>

      <FadeIn delay={120}>
        <Card elevated style={{ gap: spacing.lg }}>
          <Field label="Code de l'espace" error={codeError}>
            <Input
              placeholder="Ex. K7M2QX9"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              value={code}
              onChangeText={(t) => {
                setCode(t.toUpperCase());
                if (codeError) setCodeError(null);
              }}
              invalid={!!codeError}
              onSubmitEditing={onJoin}
              returnKeyType="go"
              style={{ letterSpacing: 3, fontWeight: "700" }}
            />
          </Field>
          <Button title="Rejoindre" size="lg" onPress={onJoin} loading={loading} fullWidth />
        </Card>
      </FadeIn>
    </Screen>
  );
}

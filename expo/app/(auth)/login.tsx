import { useRouter } from "expo-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { BrandMark, Wordmark } from "@/components/Brand";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signIn, resendConfirmation } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [needsConfirmation, setNeedsConfirmation] = useState<boolean>(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.error("Renseigne ton email et ton mot de passe.");
      return;
    }
    setLoading(true);
    setNeedsConfirmation(false);
    try {
      await signIn(email, password);
      // The root auth gate handles navigation on success.
    } catch (error) {
      const message = friendlyError(error);
      if (message.includes("confirmé")) setNeedsConfirmation(true);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      await resendConfirmation(email);
      toast.success("Email de confirmation renvoyé.");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  return (
    <AuthScaffold>
      <FadeIn>
        <View style={{ alignItems: "center", gap: spacing.md, marginBottom: spacing.xxl }}>
          <BrandMark size={72} />
          <Wordmark size={30} />
          <AppText variant="bodyMuted" center style={{ maxWidth: 280 }}>
            Le réseau de vos souvenirs partagés. À vivre, et à rejouer ensemble.
          </AppText>
        </View>
      </FadeIn>

      <FadeIn delay={120}>
        <Card elevated style={{ gap: spacing.lg }}>
          <Field label="Email">
            <Input
              icon={<Mail size={18} color={colors.textFaint} />}
              placeholder="toi@exemple.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </Field>

          <Field label="Mot de passe">
            <Input
              icon={<Lock size={18} color={colors.textFaint} />}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={{ position: "absolute", right: 12, top: 34 }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
            </TouchableOpacity>
          </Field>

          <TouchableOpacity onPress={() => router.push("/forgot-password")} style={{ alignSelf: "flex-end", marginTop: -spacing.xs }} hitSlop={8}>
            <AppText style={{ color: colors.accent, fontWeight: "600", fontSize: 13.5 }}>Mot de passe oublié ?</AppText>
          </TouchableOpacity>

          {needsConfirmation ? (
            <TouchableOpacity onPress={onResend}>
              <AppText style={{ color: colors.accent, fontWeight: "600", fontSize: 13.5 }}>
                Renvoyer l&apos;email de confirmation
              </AppText>
            </TouchableOpacity>
          ) : null}

          <Button title="Se connecter" onPress={onSubmit} loading={loading} size="lg" fullWidth />

          <SocialAuthButtons />
        </Card>
      </FadeIn>

      <FadeIn delay={200}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xl }}>
          <AppText variant="bodyMuted">Pas encore de compte ?</AppText>
          <TouchableOpacity onPress={() => router.push("/signup")}>
            <AppText style={{ color: colors.primary, fontWeight: "700" }}>Créer un compte</AppText>
          </TouchableOpacity>
        </View>
      </FadeIn>
    </AuthScaffold>
  );
}

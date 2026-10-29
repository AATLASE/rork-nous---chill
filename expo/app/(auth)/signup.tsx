import { useLocalSearchParams, useRouter } from "expo-router";
import { Eye, EyeOff, Lock, Mail, MailCheck, Ticket, User } from "lucide-react-native";
import { useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { BrandMark, Wordmark } from "@/components/Brand";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Input";
import { FadeIn } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { getPendingInvite } from "@/lib/pendingInvite";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";

export default function SignupScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signUp, resendConfirmation } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>(params.code ?? "");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);

  useEffect(() => {
    if (!params.code) {
      getPendingInvite().then((code) => {
        if (code) setInviteCode(code);
      });
    }
  }, [params.code]);

  const onSubmit = async () => {
    if (!name.trim()) return toast.error("Indique ton prénom.");
    if (!email.trim() || !password) return toast.error("Renseigne ton email et ton mot de passe.");
    if (password.length < 6) return toast.error("Le mot de passe doit faire au moins 6 caractères.");

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp({
        email,
        password,
        name,
        inviteCode: inviteCode.trim() || null,
      });
      if (needsConfirmation) {
        setSent(true);
      } else {
        toast.success("Bienvenue dans Gather !");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthScaffold>
        <FadeIn>
          <View style={{ alignItems: "center", gap: spacing.lg }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MailCheck size={38} color={colors.primary} />
            </View>
            <AppText variant="title" center>Vérifie tes emails</AppText>
            <AppText variant="bodyMuted" center style={{ maxWidth: 300 }}>
              On a envoyé un lien de confirmation à{"\n"}
              <AppText style={{ color: colors.text, fontWeight: "700" }}>{email.trim()}</AppText>.{"\n"}
              Clique dessus, puis reviens te connecter.
            </AppText>
            <Button title="Aller à la connexion" onPress={() => router.replace("/login")} size="lg" fullWidth style={{ marginTop: spacing.sm }} />
            <TouchableOpacity onPress={() => resendConfirmation(email).then(() => toast.success("Email renvoyé.")).catch((e) => toast.error(friendlyError(e)))}>
              <AppText style={{ color: colors.accent, fontWeight: "600" }}>Renvoyer l&apos;email</AppText>
            </TouchableOpacity>
          </View>
        </FadeIn>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold>
      <FadeIn>
        <View style={{ alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl }}>
          <BrandMark size={64} />
          <Wordmark size={26} />
          <AppText variant="bodyMuted" center>Crée ton compte et lance ta première saison.</AppText>
        </View>
      </FadeIn>

      <FadeIn delay={120}>
        <Card elevated style={{ gap: spacing.lg }}>
          {inviteCode ? (
            <Badge label={`Invitation détectée · ${inviteCode.toUpperCase()}`} tone="gold" />
          ) : null}

          <Field label="Prénom">
            <Input
              icon={<User size={18} color={colors.textFaint} />}
              placeholder="Samuel"
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          </Field>

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

          <Field label="Mot de passe" hint="6 caractères minimum">
            <Input
              icon={<Lock size={18} color={colors.textFaint} />}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
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

          <Field label="Code d'invitation (optionnel)">
            <Input
              icon={<Ticket size={18} color={colors.textFaint} />}
              placeholder="Ex. K7M2QX9"
              autoCapitalize="characters"
              autoCorrect={false}
              value={inviteCode}
              onChangeText={setInviteCode}
            />
          </Field>

          <Button title="Créer mon compte" onPress={onSubmit} loading={loading} size="lg" fullWidth />

          <SocialAuthButtons inviteCode={inviteCode.trim() || undefined} />
        </Card>
      </FadeIn>

      <FadeIn delay={200}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xl }}>
          <AppText variant="bodyMuted">Déjà un compte ?</AppText>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <AppText style={{ color: colors.primary, fontWeight: "700" }}>Se connecter</AppText>
          </TouchableOpacity>
        </View>
      </FadeIn>
    </AuthScaffold>
  );
}

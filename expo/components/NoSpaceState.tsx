import { useRouter } from "expo-router";
import { Plus, Ticket } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { colors, spacing } from "@/constants/theme";

/**
 * What every tab shows before the user belongs to any space. Both routes in are
 * equally likely for a newcomer — someone who was invited has a code, not a
 * space to create — so they read as one pair of choices on every tab, not only
 * on the home screen.
 */
export function NoSpaceState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  const router = useRouter();
  return (
    <>
      <EmptyState icon={icon} title={title} subtitle={subtitle} />
      <View style={{ gap: spacing.md, marginTop: -spacing.xl }}>
        <Button title="Créer un espace" icon={<Plus size={18} color={colors.primaryFg} />} onPress={() => router.push("/create-space")} />
        <Button title="J'ai un code" variant="secondary" icon={<Ticket size={18} color={colors.text} />} onPress={() => router.push("/join")} />
      </View>
    </>
  );
}

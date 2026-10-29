import { Music } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import { type Review } from "@/lib/types";

export function ReviewContentRows({ review }: { review: Review }) {
  const rows: { label: string; value: string | null; icon?: React.ReactNode }[] = [
    { label: "Moment préféré", value: review.favorite_moment },
    { label: "Moment gênant", value: review.awkward_moment },
    { label: "Citation drôle", value: review.funny_quote },
    { label: "Résumé", value: review.summary },
  ];
  return (
    <View style={{ gap: spacing.md }}>
      {rows
        .filter((r) => r.value)
        .map((r) => (
          <View key={r.label} style={{ gap: 3 }}>
            <AppText variant="overline">{r.label}</AppText>
            <AppText variant="body">{r.value}</AppText>
          </View>
        ))}
      {review.song ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Music size={15} color={colors.accent} />
          <AppText style={{ color: colors.accent, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
            {review.song}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

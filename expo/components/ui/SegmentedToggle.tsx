import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { colors, radius } from "@/constants/theme";
import { PressableScale } from "./motion";
import { AppText } from "./Text";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Read by screen readers instead of the label when it needs more context. */
  accessibilityLabel?: string;
}

/** Two or three mutually exclusive views of the same content (grille/timeline, par question/par personne). */
export function SegmentedToggle<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3 }}>
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            withHaptic={false}
            accessibilityRole="button"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected: active }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: active ? colors.surface : "transparent" }}
          >
            {Icon ? <Icon size={15} color={active ? colors.text : colors.textMuted} /> : null}
            <AppText style={{ fontSize: 13, fontWeight: "600", color: active ? colors.text : colors.textMuted }}>{o.label}</AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

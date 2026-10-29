import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { colors, radius } from "@/constants/theme";
import { MemberRole } from "@/lib/types";
import { AppText } from "./Text";

type Tone = "primary" | "gold" | "muted" | "success" | "destructive" | "outline" | "solid" | "onImage";

interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function toneColors(tone: Tone): { bg: string; fg: string; border?: string } {
  switch (tone) {
    case "primary":
      return { bg: colors.primarySoft, fg: colors.primary };
    case "gold":
      return { bg: colors.accentSoft, fg: colors.accent };
    case "success":
      return { bg: colors.successSoft, fg: colors.success };
    case "destructive":
      return { bg: colors.destructiveSoft, fg: colors.destructive };
    case "outline":
      return { bg: "transparent", fg: colors.textMuted, border: colors.borderStrong };
    // What the group expects of you: the one filled red badge.
    case "solid":
      return { bg: colors.primary, fg: colors.primaryFg };
    // Over a photo, where a tinted background would vanish.
    case "onImage":
      return { bg: "rgba(0,0,0,0.55)", fg: "#fff" };
    case "muted":
    default:
      return { bg: colors.surface, fg: colors.textMuted };
  }
}

export function Badge({ label, tone = "muted", icon, style }: BadgeProps) {
  const c = toneColors(tone);
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: c.bg,
          borderColor: c.border,
          borderWidth: c.border ? 1 : 0,
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: radius.sm,
          alignSelf: "flex-start",
          maxWidth: "100%",
        },
        style,
      ]}
    >
      {icon}
      <AppText numberOfLines={1} style={{ flexShrink: 1, fontSize: 11.5, fontWeight: "700", color: c.fg, letterSpacing: 0.2 }}>{label}</AppText>
    </View>
  );
}

const ROLE_META: Record<MemberRole, { label: string; tone: Tone }> = {
  owner: { label: "Propriétaire", tone: "gold" },
  member: { label: "Membre", tone: "primary" },
  observer: { label: "Observateur", tone: "muted" },
};

export function RoleBadge({ role, style }: { role: MemberRole; style?: StyleProp<ViewStyle> }) {
  const meta = ROLE_META[role];
  return <Badge label={meta.label} tone={meta.tone} style={style} />;
}

export function StatusDot({ color = colors.primary, size = 8 }: { color?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Selectable chip (used for tags / filters). */
export function Chip({
  label,
  active = false,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: active ? colors.primary : colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
      }}
    >
      {icon}
      <AppText style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primaryFg : colors.textMuted }}>
        {label}
      </AppText>
    </View>
  );
}

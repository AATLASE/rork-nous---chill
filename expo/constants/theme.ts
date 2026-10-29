import { Platform, TextStyle, ViewStyle } from "react-native";

/**
 * Gather — Netflix-inspired theme with dark & light palettes.
 * The exported `colors` object is mutable: `applyPalette()` swaps every value
 * in place so all inline styles pick up the active theme on re-render.
 */
export type ThemeScheme = "dark" | "light";

const darkColors = {
  // Canvas
  bg: "#141416",
  bgDeep: "#0B0B0C",
  bgElevated: "#1B1B1E",

  // Surfaces
  card: "#1C1C1F",
  cardElevated: "#242428",
  surface: "#2A2A2E",

  // Lines
  border: "#303034",
  borderStrong: "#3D3D42",
  // The field being typed in. Neutral on purpose: red means an error.
  focus: "#C8C8CE",

  // Text
  // `caption` (12px) and `overline` (11px) render in textFaint, so it carries
  // real information (dates, counts, section labels) and must clear WCAG AA.
  // The former #67676E measured 3.3:1 on bg and 3.0:1 on card — both failing.
  text: "#F7F7F7",
  textMuted: "#9B9BA2",
  textFaint: "#8A8A92",

  // Brand
  primary: "#EF233C",
  primaryDark: "#C2182C",
  primarySoft: "rgba(239,35,60,0.14)",
  primaryFg: "#FFFFFF",

  // Highlights
  accent: "#CDBE57",
  accentSoft: "rgba(205,190,87,0.16)",

  // Status
  success: "#3DD27E",
  successSoft: "rgba(61,210,126,0.14)",
  warning: "#E8A13A",
  destructive: "#E63946",
  destructiveSoft: "rgba(230,57,70,0.16)",

  // Poster blocks (bilan scellé, affiches sans photo): they stay dark in both
  // themes, so their text is always white rather than following `text`.
  heroFrom: "#3A1418",
  heroTo: "#1E1012",
  onHero: "#FFFFFF",
  onHeroMuted: "rgba(255,255,255,0.7)",
  // Top of the sign-in and splash backgrounds, fading into `bg`.
  brandGlow: "#2A0E13",

  // Misc
  overlay: "rgba(0,0,0,0.6)",
  scrim: "rgba(10,10,12,0.92)",
  white: "#FFFFFF",
  black: "#000000",
};

export type Palette = { [K in keyof typeof darkColors]: string };

const lightColors: Palette = {
  // Canvas
  bg: "#F4F4F6",
  bgDeep: "#EAEAEE",
  bgElevated: "#FFFFFF",

  // Surfaces
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  surface: "#EBEBEF",

  // Lines
  border: "#E2E2E8",
  borderStrong: "#CFCFD7",
  focus: "#1B1B1F",

  // Text
  // Light mode was the worse offender: textFaint measured 2.5:1 on bg. Muted is
  // darkened alongside it so the muted → faint hierarchy survives the fix.
  text: "#1B1B1F",
  textMuted: "#5A5A64",
  textFaint: "#6C6C76",

  // Brand
  primary: "#E11D33",
  primaryDark: "#B9152A",
  primarySoft: "rgba(225,29,51,0.10)",
  primaryFg: "#FFFFFF",

  // Highlights
  accent: "#A8912E",
  accentSoft: "rgba(168,145,46,0.14)",

  // Status
  success: "#1FA85D",
  successSoft: "rgba(31,168,93,0.12)",
  warning: "#C97F16",
  destructive: "#D62839",
  destructiveSoft: "rgba(214,40,57,0.10)",

  // Poster blocks: same as dark on purpose (see darkColors).
  heroFrom: "#3A1418",
  heroTo: "#1E1012",
  onHero: "#FFFFFF",
  onHeroMuted: "rgba(255,255,255,0.7)",
  // The dark bordeaux sat behind dark text here; a light tint keeps the glow.
  brandGlow: "#F6DCE0",

  // Misc
  overlay: "rgba(15,15,20,0.45)",
  scrim: "rgba(20,20,24,0.88)",
  white: "#FFFFFF",
  black: "#000000",
};

/** Mutable palette — values are swapped in place when the theme changes. */
export const colors: Palette = { ...darkColors };

let scheme: ThemeScheme = "dark";

/** Swaps every color value in place for the given scheme. */
export function applyPalette(next: ThemeScheme): void {
  scheme = next;
  Object.assign(colors, next === "dark" ? darkColors : lightColors);
}

/** The scheme currently applied to `colors`. */
export function currentScheme(): ThemeScheme {
  return scheme;
}

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

const fontFamily = Platform.select({ ios: "System", android: "sans-serif", default: "System" });

export const fonts = {
  black: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  family: fontFamily,
} as const;

/** Getter-based so text colors always follow the active palette. */
export const type = {
  get display(): TextStyle {
    return { fontSize: 34, lineHeight: 38, fontWeight: "800" as const, letterSpacing: -0.8, color: colors.text };
  },
  get title(): TextStyle {
    return { fontSize: 26, lineHeight: 30, fontWeight: "800" as const, letterSpacing: -0.6, color: colors.text };
  },
  get h2(): TextStyle {
    return { fontSize: 20, lineHeight: 25, fontWeight: "700" as const, letterSpacing: -0.3, color: colors.text };
  },
  get h3(): TextStyle {
    return { fontSize: 17, lineHeight: 22, fontWeight: "700" as const, letterSpacing: -0.2, color: colors.text };
  },
  get body(): TextStyle {
    return { fontSize: 15, lineHeight: 21, fontWeight: "500" as const, color: colors.text };
  },
  get bodyMuted(): TextStyle {
    return { fontSize: 15, lineHeight: 21, fontWeight: "500" as const, color: colors.textMuted };
  },
  get label(): TextStyle {
    return { fontSize: 13, lineHeight: 17, fontWeight: "600" as const, color: colors.textMuted };
  },
  get caption(): TextStyle {
    return { fontSize: 12, lineHeight: 15, fontWeight: "600" as const, letterSpacing: 0.2, color: colors.textFaint };
  },
  get overline(): TextStyle {
    return {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "700" as const,
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
      color: colors.textFaint,
    };
  },
};

/** Getter-based so shadows soften automatically on the light theme. */
export const shadows = {
  get poster(): ViewStyle {
    return {
      shadowColor: "#000000",
      shadowOpacity: scheme === "dark" ? 0.55 : 0.16,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 16 },
      elevation: scheme === "dark" ? 14 : 6,
    };
  },
  get card(): ViewStyle {
    return {
      shadowColor: "#000000",
      shadowOpacity: scheme === "dark" ? 0.4 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: scheme === "dark" ? 8 : 3,
    };
  },
  get glow(): ViewStyle {
    return {
      shadowColor: colors.primary,
      shadowOpacity: scheme === "dark" ? 0.5 : 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
    };
  },
};

export const theme = { colors, radius, spacing, type, shadows, fonts } as const;
export type Theme = typeof theme;

import React, { useEffect, useRef, useState } from "react";
import {
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  TextInput,
  TextInputContentSizeChangeEventData,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { AppText } from "./Text";

interface FieldProps {
  label?: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Field({ label, error, hint, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 7 }, style]}>
      {label ? <AppText variant="label" style={{ color: colors.textMuted }}>{label}</AppText> : null}
      {children}
      {error ? (
        <AppText style={{ fontSize: 12.5, color: colors.destructive, fontWeight: "600" }}>{error}</AppText>
      ) : hint ? (
        <AppText style={{ fontSize: 12.5, color: colors.textFaint }}>{hint}</AppText>
      ) : null}
    </View>
  );
}

/**
 * The browser draws its own focus rectangle inside the field's border, so a
 * focused field showed two outlines. The border alone says which field is active.
 * "none" is missing from React Native's outlineStyle type but react-native-web
 * passes it through; a zero width alone leaves Chrome's "auto" ring in place.
 */
export const noWebOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null;

/** Text height of an empty multiline field — keeps the box at its ~110px look. */
const MULTILINE_MIN_HEIGHT = 84;

/** The bits of a DOM <textarea> the web branch needs, without pulling in DOM types. */
type WebTextArea = { style: { height: string }; scrollHeight: number; offsetHeight: number; clientHeight: number };

/**
 * Long answers (review, compte rendu, description d'épisode…) get reread while
 * they are written, so a multiline field grows with its content instead of
 * scrolling inside a fixed box — every screen using it already scrolls.
 *
 * Native reports the text height via `onContentSizeChange` (padding included,
 * borders not — hence `extraHeight` when the input draws its own border). On
 * web the <textarea> never resizes itself, so the node is measured directly;
 * its height has to go back to "auto" first, otherwise `scrollHeight` returns
 * the current height and the box could only ever grow, never shrink.
 */
export function useAutoGrow({
  enabled,
  value,
  minHeight,
  extraHeight = 0,
}: {
  enabled?: boolean;
  value?: string;
  minHeight: number;
  extraHeight?: number;
}) {
  const ref = useRef<TextInput>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (!enabled || !isWeb) return;
    const node = ref.current as unknown as WebTextArea | null;
    if (!node?.style) return;
    node.style.height = "auto";
    const chrome = node.offsetHeight - node.clientHeight; // borders, so border-box math stays exact
    node.style.height = `${node.scrollHeight + chrome}px`;
  }, [enabled, isWeb, value]);

  return {
    ref,
    minHeight: enabled ? minHeight : undefined,
    height: enabled && !isWeb ? Math.max(minHeight, contentHeight + extraHeight) : undefined,
    onContentSizeChange: (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
      setContentHeight(e.nativeEvent.contentSize.height),
  };
}

interface InputProps extends TextInputProps {
  icon?: React.ReactNode;
  invalid?: boolean;
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({
  icon,
  invalid,
  multiline,
  containerStyle,
  style,
  value,
  onFocus,
  onBlur,
  onContentSizeChange,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState<boolean>(false);
  // Red is kept for errors: the brand red on focus read as one.
  const borderColor = invalid ? colors.destructive : focused ? colors.focus : colors.border;
  const grow = useAutoGrow({ enabled: multiline, value, minHeight: MULTILINE_MIN_HEIGHT });

  return (
    <View
      style={[
        {
          flexDirection: "row",
          // "stretch" so the typing area covers the whole box: with "flex-start"
          // the input was only as tall as its text, leaving dead space below it.
          alignItems: multiline ? "stretch" : "center",
          gap: 10,
          backgroundColor: colors.bgElevated,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: spacing.md,
          minHeight: multiline ? undefined : 50,
          paddingVertical: multiline ? spacing.md : 0,
        },
        containerStyle,
      ]}
    >
      {icon ? <View style={{ alignSelf: multiline ? "flex-start" : "center", paddingTop: multiline ? 2 : 0 }}>{icon}</View> : null}
      <TextInput
        {...rest}
        ref={grow.ref}
        value={value}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onContentSizeChange={(e) => {
          grow.onContentSizeChange(e);
          onContentSizeChange?.(e);
        }}
        placeholderTextColor={colors.textFaint}
        style={[
          {
            flex: 1,
            color: colors.text,
            fontSize: 15.5,
            fontWeight: "500",
            paddingVertical: multiline ? 0 : 14,
            textAlignVertical: multiline ? "top" : "center",
            minHeight: grow.minHeight,
            height: grow.height,
          },
          noWebOutline,
          style,
        ]}
      />
    </View>
  );
}

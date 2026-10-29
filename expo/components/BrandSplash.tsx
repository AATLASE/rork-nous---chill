import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { BrandMark, Wordmark } from "@/components/Brand";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";

/**
 * Animated, cinematic launch screen rendered by JS.
 * The brand name and "G" mark are drawn from components (never a baked PNG),
 * so the launch identity always matches the live app.
 */
export function BrandSplash({ done, onHidden }: { done: boolean; onHidden: () => void }) {
  const screen = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(screen, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(enter, {
        toValue: 1,
        duration: 640,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screen, enter]);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      Animated.timing(screen, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onHidden();
      });
    }, 360);
    return () => clearTimeout(timer);
  }, [done, screen, onHidden]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: screen, zIndex: 50 }]}>
      <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
        <LinearGradient
          colors={[colors.brandGlow, colors.bg, colors.bgDeep]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={{ alignItems: "center", gap: spacing.md, opacity: enter, transform: [{ translateY }, { scale }] }}
          >
            <BrandMark size={96} />
            <Wordmark size={38} />
            <AppText variant="bodyMuted" center style={{ maxWidth: 260, marginTop: spacing.xs }}>
              Vos souvenirs partagés, à rejouer ensemble.
            </AppText>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

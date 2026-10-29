import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Check, Minus, Plus, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image as RNImage,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { cropImageAsset, PickedAsset } from "@/lib/media";

const DIM_COLOR = "rgba(8,8,9,0.82)";
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.35;
/** Thickness of the border-trick ring that dims the corners around the circular frame. */
const CIRCLE_PAD = 600;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Props {
  /** The freshly picked image to adjust; null hides the modal. */
  asset: PickedAsset | null;
  title?: string;
  /** "cover" = wide rounded rectangle (space cover), "circle" = round avatar frame. */
  shape?: "cover" | "circle";
  onCancel: () => void;
  /** Called with the cropped (framed) asset when the user validates. */
  onDone: (cropped: PickedAsset) => void;
}

/**
 * Full-screen adjust step shown after picking a cover or avatar image: the
 * clear window matches the final frame (cover card ratio, or a circle for
 * avatars), the rest is dimmed. The user pans/zooms the image, then
 * validation crops it to exactly what the window shows.
 */
export function CoverAdjustModal({ asset, title = "Ajuster la couverture", shape = "cover", onCancel, onDone }: Props) {
  const window = Dimensions.get("window");
  const isCircle = shape === "circle";
  // Clear window matches the space cover on the home screen (full width, 190pt tall),
  // or a centered square for the circular avatar frame.
  const coverW = Math.round(window.width - spacing.lg * 2 - 8);
  const cardRatio = (window.width - spacing.lg * 2) / 190;
  const frameW = isCircle ? Math.min(coverW, 300) : coverW;
  const frameH = isCircle ? frameW : Math.round(frameW / cardRatio);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [processing, setProcessing] = useState<boolean>(false);

  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const zoom = useRef(new Animated.Value(1)).current;

  const gesture = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    pinchDist: 1,
    pinching: false,
    panDx: 0,
    panDy: 0,
  });

  // Displayed size of the image at zoom 1 (covers the clear window exactly).
  const disp = useMemo(() => {
    if (!imgSize) return null;
    const coverScale = Math.max(frameW / imgSize.w, frameH / imgSize.h);
    return { w: imgSize.w * coverScale, h: imgSize.h * coverScale, coverScale };
  }, [imgSize, frameW, frameH]);

  const dispRef = useRef(disp);
  dispRef.current = disp;

  const apply = useCallback(
    (nextScale: number, nextTx: number, nextTy: number) => {
      const d = dispRef.current;
      if (!d) return;
      const s = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      const maxTx = Math.max(0, (d.w * s - frameW) / 2);
      const maxTy = Math.max(0, (d.h * s - frameH) / 2);
      const tx = clamp(nextTx, -maxTx, maxTx);
      const ty = clamp(nextTy, -maxTy, maxTy);
      const g = gesture.current;
      g.scale = s;
      g.tx = tx;
      g.ty = ty;
      zoom.setValue(s);
      translate.setValue({ x: tx, y: ty });
      setZoomPct(Math.round(s * 100));
    },
    [frameW, frameH, translate, zoom],
  );

  const applyRef = useRef(apply);
  applyRef.current = apply;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const g = gesture.current;
        g.startScale = g.scale;
        g.startTx = g.tx;
        g.startTy = g.ty;
        g.pinching = false;
        g.panDx = 0;
        g.panDy = 0;
      },
      onPanResponderMove: (evt, gestureState) => {
        const g = gesture.current;
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.max(1, Math.hypot(dx, dy));
          if (!g.pinching) {
            g.pinching = true;
            g.pinchDist = dist;
            g.startScale = g.scale;
          }
          applyRef.current(g.startScale * (dist / g.pinchDist), g.tx, g.ty);
        } else {
          if (g.pinching) {
            // Pinch ended, one finger stays: rebase the pan so it doesn't jump.
            g.pinching = false;
            g.startTx = g.tx;
            g.startTy = g.ty;
            g.panDx = gestureState.dx;
            g.panDy = gestureState.dy;
          }
          applyRef.current(g.scale, g.startTx + (gestureState.dx - g.panDx), g.startTy + (gestureState.dy - g.panDy));
        }
      },
      onPanResponderRelease: () => {
        gesture.current.pinching = false;
      },
      onPanResponderTerminate: () => {
        gesture.current.pinching = false;
      },
    }),
  ).current;

  // Resolve dimensions + reset transforms whenever a new image comes in.
  useEffect(() => {
    if (!asset) return;
    setProcessing(false);
    setImgSize(null);
    gesture.current = { scale: 1, tx: 0, ty: 0, startScale: 1, startTx: 0, startTy: 0, pinchDist: 1, pinching: false, panDx: 0, panDy: 0 };
    zoom.setValue(1);
    translate.setValue({ x: 0, y: 0 });
    setZoomPct(100);

    if (asset.width && asset.height) {
      setImgSize({ w: asset.width, h: asset.height });
      return;
    }
    RNImage.getSize(
      asset.uri,
      (w, h) => setImgSize({ w, h }),
      (e) => console.log("[cover-adjust] getSize failed:", e),
    );
  }, [asset, translate, zoom]);

  const stepZoom = (delta: number) => {
    const g = gesture.current;
    apply(g.scale + delta, g.tx, g.ty);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const onValidate = async () => {
    if (!asset) return;
    if (!imgSize || !disp) {
      // Dimensions unknown: keep the original rather than blocking the user.
      onDone(asset);
      return;
    }
    setProcessing(true);
    try {
      const { scale, tx, ty } = gesture.current;
      const total = disp.coverScale * scale;
      const cropW = frameW / total;
      const cropH = frameH / total;
      const originX = imgSize.w / 2 - tx / total - cropW / 2;
      const originY = imgSize.h / 2 - ty / total - cropH / 2;
      const cropped = await cropImageAsset(asset, { originX, originY, width: cropW, height: cropH }, imgSize.w, imgSize.h);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      onDone(cropped);
    } catch (e) {
      console.log("[cover-adjust] crop failed, using original image:", e);
      onDone(asset);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible={asset !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <AppText variant="h3">{title}</AppText>
              <AppText variant="caption" style={{ marginTop: 2 }}>
                {isCircle
                  ? "Déplace et zoome — le cercle clair sera ta photo"
                  : "Déplace et zoome — la zone claire sera ta couverture"}
              </AppText>
            </View>
            <IconButton icon={<X size={20} color={colors.text} />} onPress={onCancel} size={40} accessibilityLabel="Annuler" />
          </View>

          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", overflow: "hidden" }} {...responder.panHandlers}>
            {asset && disp ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  width: disp.w,
                  height: disp.h,
                  transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale: zoom }],
                }}
              >
                <Image source={{ uri: asset.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              </Animated.View>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}

            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <View style={{ flex: 1, backgroundColor: DIM_COLOR }} />
              <View style={{ flexDirection: "row", height: frameH }}>
                <View style={{ flex: 1, backgroundColor: DIM_COLOR }} />
                {isCircle ? (
                  <View style={{ width: frameW, height: frameH, overflow: "hidden" }}>
                    {/* Dim ring: huge border with a circular inner edge dims the square corners. */}
                    <View
                      style={{
                        position: "absolute",
                        top: -CIRCLE_PAD,
                        left: -CIRCLE_PAD,
                        width: frameW + CIRCLE_PAD * 2,
                        height: frameH + CIRCLE_PAD * 2,
                        borderWidth: CIRCLE_PAD,
                        borderColor: DIM_COLOR,
                        borderRadius: CIRCLE_PAD + frameW / 2,
                      }}
                    />
                    <View style={{ ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: frameW / 2, overflow: "hidden" }}>
                      <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                      <View style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                    </View>
                  </View>
                ) : (
                  <View style={{ width: frameW, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: radius.xl, overflow: "hidden" }}>
                    <View style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                    <View style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                    <View style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                    <View style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
                  </View>
                )}
                <View style={{ flex: 1, backgroundColor: DIM_COLOR }} />
              </View>
              <View style={{ flex: 1, backgroundColor: DIM_COLOR }} />
            </View>
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg }}>
              <IconButton icon={<Minus size={18} color={colors.text} />} onPress={() => stepZoom(-ZOOM_STEP)} size={44} accessibilityLabel="Dézoomer" />
              <AppText variant="label" style={{ width: 60, textAlign: "center", color: colors.text }}>
                {zoomPct} %
              </AppText>
              <IconButton icon={<Plus size={18} color={colors.text} />} onPress={() => stepZoom(ZOOM_STEP)} size={44} accessibilityLabel="Zoomer" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title="Annuler" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
              <Button
                title="Valider"
                icon={<Check size={18} color={colors.primaryFg} />}
                onPress={onValidate}
                loading={processing}
                disabled={!disp}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

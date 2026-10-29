import { Alert, Platform } from "react-native";

/**
 * Asks the user to confirm an action, then runs it.
 *
 * On native this is the usual two-button Alert. On the web, react-native-web's
 * Alert.alert does nothing at all, so every confirmation (sign out, delete…)
 * silently did nothing on the PWA; the browser's own confirm dialog is used
 * there instead.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  cancelLabel = "Annuler",
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

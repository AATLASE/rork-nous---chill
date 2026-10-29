import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY = "nc_pending_invite";

/** Persist an invite code entered during signup, to redeem after first login. */
export async function setPendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, code.trim().toUpperCase());
  } catch {}
}

export async function getPendingInvite(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/**
 * Web: an invite link opened while signed out is redirected to /login by the
 * auth gate, which drops `?code=`. Called once at startup, before the gate
 * runs, so the code survives signup or login and is redeemed afterwards
 * (see useRedeemPendingInvite).
 */
export function captureInviteFromWebUrl(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (!pathname.toLowerCase().startsWith("/join")) return;
  const code = new URLSearchParams(search).get("code");
  if (code?.trim()) void setPendingInvite(code);
}

/** Public web address of the app: invite links must open for everyone, not only in the native app. */
export const APP_WEB_URL = "https://app.nouschill.fr";

/** Shareable invite link. */
export function inviteLink(code: string): string {
  return `${APP_WEB_URL}/join?code=${encodeURIComponent(code)}`;
}

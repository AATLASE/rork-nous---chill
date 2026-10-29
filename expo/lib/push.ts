import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

type NotificationsApi = typeof import("expo-notifications");

let notificationsModule: NotificationsApi | null | undefined;

/**
 * `expo-notifications`, loaded only where it can actually do something.
 *
 * Importing it registers a device-push listener at module load, and Expo Go
 * (SDK 53+) answers that with a full-screen console error because remote push
 * was removed from the sandbox app. Requiring it lazily keeps the dev overlay
 * clean; callers treat `null` as "push is unavailable here", which it is.
 */
export function loadNotifications(): NotificationsApi | null {
  if (notificationsModule === undefined) {
    notificationsModule =
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
        ? null
        : // A static import would defeat the purpose: it runs at module load.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require("expo-notifications") as NotificationsApi);
  }
  return notificationsModule;
}

/**
 * Push notifications, on two very different transports.
 *
 * The `push_subscriptions` table was designed for Web Push: `endpoint`,
 * `p256dh`, `auth` — the three fields a browser hands out when it subscribes.
 * That is the transport the deployed PWA uses, and the only one that works on
 * Vercel.
 *
 * Native builds have no browser PushSubscription. They get an Expo push token
 * (`ExponentPushToken[…]`) instead, which is stored in the `endpoint` column
 * with the key columns left empty. The two are trivially distinguishable — a
 * web endpoint is an https:// URL — and the sender branches on the shape.
 *
 * Everything here is best-effort: push is a bonus, never a reason to fail a
 * sign-in.
 */

/** Whether push can work at all in this runtime, before asking anybody anything. */
export type PushSupport = "supported" | "unsupported";

/** What the user has decided, as far as the system will tell us. */
export type PushPermission = "granted" | "denied" | "undetermined";

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/* ------------------------------ Web Push ------------------------------ */

function isWeb(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

export function webPushSupported(): boolean {
  return (
    isWeb() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    // Without the server's public key the browser has nothing to subscribe to.
    VAPID_PUBLIC_KEY.length > 0
  );
}

/**
 * The VAPID public key travels as URL-safe base64 and has to reach
 * `PushManager.subscribe` as raw bytes.
 */
function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * The registration the push subscription lives on. `ready` resolves only once a
 * worker is active, so this waits rather than racing the registration done at
 * startup by `registerServiceWorker`.
 */
async function serviceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

interface WebSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The browser's current subscription, subscribing it if it has none yet. */
async function getWebSubscription(create: boolean): Promise<WebSubscription | null> {
  const registration = await serviceWorkerReady();
  if (!registration) return null;

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!create) return null;
      subscription = await registration.pushManager.subscribe({
        // Non-negotiable in Chrome: every push must show a notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // `toJSON` hands back the keys already in the URL-safe base64 the sender
    // expects — far less error-prone than re-encoding the raw buffers.
    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
  } catch (e) {
    console.log("[push] abonnement navigateur impossible:", e);
    return null;
  }
}

/* ----------------------------- Expo Push ------------------------------ */

/** Resolve the EAS project id needed to mint an Expo push token. */
function getProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromExtra ?? fromEasConfig ?? undefined;
}

/**
 * Returns the device's Expo push token, or null when it cannot be obtained
 * (simulator, permission not granted, no EAS project id). Never prompts: on iOS
 * a refused prompt can never be shown again, so only `enablePush`, behind the
 * user's own tap, asks. Never throws — push is always best-effort.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Cloud simulators and emulators cannot register for remote push.
    if (!Device.isDevice) return null;

    const Notifications = loadNotifications();
    if (!Notifications) return null;

    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) return null;

    const projectId = getProjectId();
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data ?? null;
  } catch {
    return null;
  }
}

/* --------------------------- Both transports -------------------------- */

export function pushSupported(): PushSupport {
  if (isWeb()) return webPushSupported() ? "supported" : "unsupported";
  return loadNotifications() ? "supported" : "unsupported";
}

/** What the system says today, without asking the user anything. */
export async function pushPermission(): Promise<PushPermission> {
  if (isWeb()) {
    if (typeof Notification === "undefined") return "denied";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "undetermined";
  }
  try {
    const settings = await loadNotifications()?.getPermissionsAsync();
    if (!settings) return "undetermined";
    if (settings.granted) return "granted";
    return settings.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "undetermined";
  }
}

/**
 * Saves this device for the signed-in user. An endpoint is one device, so it
 * belongs to whoever registered it last: a plain insert used to fail silently
 * when another account had used the same browser, leaving the device on the
 * previous owner's notifications. The RPC moves it instead.
 */
async function storeSubscription(sub: WebSubscription): Promise<void> {
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
  });
  if (error) throw error;
}

/* The "off" switch is a per-account choice on this device. Without it, the next
 * launch re-registered a device whose permission was still granted, and the
 * notifications came back on their own. */
const optOutKey = (userId: string) => `gather.pushOptOut.v1.${userId}`;

export async function pushOptedOut(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(optOutKey(userId))) === "1";
  } catch {
    return false;
  }
}

async function setPushOptOut(userId: string, optedOut: boolean): Promise<void> {
  try {
    if (optedOut) await AsyncStorage.setItem(optOutKey(userId), "1");
    else await AsyncStorage.removeItem(optOutKey(userId));
  } catch {}
}

/**
 * Registers this device for push, without ever prompting.
 *
 * Called on every sign-in, so it must stay silent: a permission dialog that
 * appears by itself, before the user has asked for anything, is the fastest way
 * to get push denied forever. Asking is `enablePush`'s job.
 */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (await pushOptedOut(userId)) return;
    if (isWeb()) {
      if ((await pushPermission()) !== "granted") return;
      const sub = await getWebSubscription(true);
      if (sub) await storeSubscription(sub);
      return;
    }

    const token = await getExpoPushToken();
    if (!token) return;
    await storeSubscription({ endpoint: token, p256dh: "", auth: "" });
  } catch (e) {
    // RLS, a schema mismatch or an offline browser must never crash the app.
    console.log("[push] enregistrement impossible:", e);
  }
}

/**
 * Asks for permission and subscribes. This is the one path allowed to prompt,
 * because the user just flipped the switch that says so.
 */
export async function enablePush(userId: string): Promise<PushPermission> {
  if (pushSupported() === "unsupported") return "denied";

  if (isWeb()) {
    let permission: NotificationPermission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "undetermined";

    const sub = await getWebSubscription(true);
    if (!sub) return "denied";
    await setPushOptOut(userId, false);
    await storeSubscription(sub);
    return "granted";
  }

  const Notifications = loadNotifications();
  if (!Notifications) return "denied";
  const settings = await Notifications.requestPermissionsAsync();
  if (!settings.granted) return settings.canAskAgain ? "undetermined" : "denied";
  await setPushOptOut(userId, false);
  await registerPushToken(userId);
  return "granted";
}

/**
 * Stops push for this device: drops the row the sender reads, and on the web
 * releases the browser subscription too, so the endpoint stops existing rather
 * than lingering as a subscription nobody will ever deliver to.
 */
export async function disablePush(userId: string, { remember = true }: { remember?: boolean } = {}): Promise<void> {
  // Remembered when the user turns push off; not on sign-out, which says
  // nothing about wanting notifications next time.
  if (remember) await setPushOptOut(userId, true);
  try {
    if (isWeb()) {
      const registration = await serviceWorkerReady();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe().catch(() => false);
      if (endpoint) {
        await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
      }
      return;
    }

    const token = await getExpoPushToken();
    if (!token) return;
    await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", token);
  } catch (e) {
    console.log("[push] désinscription impossible:", e);
  }
}

/** Removes this device's subscription (e.g. on sign-out). */
export async function unregisterPushToken(userId: string): Promise<void> {
  await disablePush(userId, { remember: false });
}

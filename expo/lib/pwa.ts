import { Platform } from "react-native";

/**
 * Registers the PWA service worker on the web only.
 *
 * This is what makes the app installable ("Add to Home Screen") and gives it an
 * offline app shell. It is a no-op on native platforms and during server
 * rendering. Registration is always best-effort — a failure never affects the
 * running app.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const register = (): void => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort: unsupported browser or blocked scope should not crash.
    });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

/* ---------------------------- Installation ---------------------------- */

/** Chrome's install event. Not in the DOM typings: it is not a standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * How this visitor can get the app on their home screen:
 * - `prompt`: Chromium handed us its install dialog, one tap away.
 * - `ios`: Safari has no API at all; the user has to go through the share sheet.
 * - `in-app`: an Instagram / Facebook / TikTok webview, which can install
 *   nothing; the link has to be opened in the real browser first.
 */
export type InstallPath = "prompt" | "ios" | "in-app";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const installListeners = new Set<() => void>();

const notifyInstall = (): void => installListeners.forEach((listener) => listener());

// Listening at module load, not in a component: Chrome fires the event once,
// shortly after the page loads, and a listener added after the splash would
// miss it.
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keeps Chrome's own mini-infobar from competing with our banner.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notifyInstall();
  });
}

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|LinkedInApp|Line\//i;

function isIOS(ua: string): boolean {
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Already running from the home screen, so there is nothing left to install. */
export function isStandalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** The way to install from here, or null when there is none (or no need). */
export function getInstallPath(): InstallPath | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  if (installed || isStandalone()) return null;
  if (deferredPrompt) return "prompt";
  const ua = navigator.userAgent;
  if (IN_APP_BROWSER.test(ua)) return "in-app";
  if (isIOS(ua)) return "ios";
  return null;
}

/** Called whenever `getInstallPath` may have changed its answer. */
export function subscribeInstall(listener: () => void): () => void {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

/** Opens the browser's install dialog. Only meaningful on the `prompt` path. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  // An event can be prompted only once; Chrome sends a fresh one if the app is
  // still installable later.
  deferredPrompt = null;
  notifyInstall();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  }
}

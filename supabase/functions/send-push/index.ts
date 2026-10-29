/**
 * send-push — turns a row of `notifications` into a notification on a device.
 *
 * Called by the database itself: every insert into `notifications` fires the
 * trigger installed by 20260802010000_push_delivery.sql, which POSTs the new row
 * here. The triggers that decide *who* gets notified live in
 * 20260802000000_notify_members_and_observers.sql; this function only carries
 * the message the last mile.
 *
 * Two transports, told apart by the shape of `endpoint`:
 *
 *   • an https:// URL   → Web Push (RFC 8291). This is what the PWA deployed on
 *                         Vercel uses, and it is the only one that works in a
 *                         browser. The payload is encrypted for the endpoint
 *                         with the keys the browser handed out (p256dh/auth) and
 *                         signed with our VAPID key pair.
 *   • ExponentPushToken → a native build registered through Expo.
 *
 * A subscription the push service has retired answers 404 or 410; that endpoint
 * is deleted rather than retried forever. This is the only way the table stays
 * clean — a browser that has forgotten its subscription never tells us.
 *
 * Deployed with --no-verify-jwt, so it authenticates callers itself with a
 * shared secret. Without that check anyone could POST here and push arbitrary
 * text to any user of the app.
 *
 * Environment (supabase secrets set …):
 *   VAPID_PUBLIC_KEY   — same key the web app subscribes with
 *   VAPID_PRIVATE_KEY  — its pair; never leaves the server
 *   VAPID_SUBJECT      — mailto:… or https://… identifying the sender
 *   PUSH_WEBHOOK_SECRET— shared with the database trigger
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */

import webpush from "npm:web-push@3.6.7";

interface NotificationRow {
  id?: string;
  user_id?: string;
  space_id?: string | null;
  title?: string | null;
  body?: string | null;
  url?: string | null;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: NotificationRow;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@example.com";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const json = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A browser endpoint is a URL; an Expo token is not. */
const isExpoToken = (endpoint: string): boolean =>
  endpoint.startsWith("ExponentPushToken[") || endpoint.startsWith("ExpoPushToken[");

async function loadSubscriptions(userId: string): Promise<Subscription[]> {
  const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`;
  const response = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`lecture des abonnements: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as Subscription[];
}

/** Endpoints the push service has retired. Keeping them means retrying forever. */
async function dropSubscriptions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const list = ids.map((id) => `"${id}"`).join(",");
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${list})`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
}

async function sendWebPush(sub: Subscription, payload: string): Promise<"sent" | "gone" | "failed"> {
  if (!sub.p256dh || !sub.auth) return "failed";
  if (!VAPID_PRIVATE_KEY) throw new Error("VAPID_PRIVATE_KEY manquant");

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: 60 * 60 * 24 },
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404: the endpoint never existed. 410: the browser dropped it.
    if (status === 404 || status === 410) return "gone";
    console.error("[send-push] web push refusé:", status, (e as Error).message);
    return "failed";
  }
}

async function sendExpoPush(
  sub: Subscription,
  row: NotificationRow,
): Promise<"sent" | "gone" | "failed"> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      to: sub.endpoint,
      title: row.title ?? "Gather",
      body: row.body ?? "",
      sound: "default",
      data: { url: row.url ?? "/" },
    }),
  });

  if (!response.ok) {
    console.error("[send-push] Expo a répondu", response.status, await response.text());
    return "failed";
  }

  const result = (await response.json()) as {
    data?: { status?: string; details?: { error?: string } };
  };
  if (result.data?.status === "error") {
    // The app was uninstalled, or the token belongs to a build that no longer exists.
    if (result.data.details?.error === "DeviceNotRegistered") return "gone";
    console.error("[send-push] Expo:", JSON.stringify(result.data));
    return "failed";
  }
  return "sent";
}

/** Constant-time comparison, so response timing says nothing about the secret. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET) {
    return json(500, { error: "PUSH_WEBHOOK_SECRET n'est pas configuré" });
  }
  // Without this check the function is an open relay for push notifications.
  if (!sameSecret(req.headers.get("x-push-secret") ?? "", WEBHOOK_SECRET)) {
    return json(401, { error: "secret invalide" });
  }

  // A plain GET is a health check: it says whether the keys are in place
  // without sending anything to anybody.
  if (req.method === "GET") {
    return json(200, {
      ok: true,
      vapid: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      serviceRole: Boolean(SERVICE_ROLE_KEY),
    });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json(400, { error: "corps illisible" });
  }

  const row = payload.record;
  if (!row?.user_id) return json(200, { skipped: "pas de destinataire" });
  if (!row.title && !row.body) return json(200, { skipped: "notification vide" });

  let subscriptions: Subscription[];
  try {
    subscriptions = await loadSubscriptions(row.user_id);
  } catch (e) {
    console.error("[send-push]", (e as Error).message);
    return json(500, { error: (e as Error).message });
  }
  if (subscriptions.length === 0) return json(200, { sent: 0, note: "aucun appareil abonné" });

  const webPayload = JSON.stringify({
    title: row.title ?? "Gather",
    body: row.body ?? "",
    url: row.url ?? "/",
    tag: row.url ?? undefined,
  });

  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const outcome = isExpoToken(sub.endpoint)
          ? await sendExpoPush(sub, row)
          : await sendWebPush(sub, webPayload);
        if (outcome === "sent") sent += 1;
        if (outcome === "gone") dead.push(sub.id);
      } catch (e) {
        // One broken device must not stop the others.
        console.error("[send-push] envoi impossible:", (e as Error).message);
      }
    }),
  );

  await dropSubscriptions(dead);

  return json(200, { sent, removed: dead.length, total: subscriptions.length });
});

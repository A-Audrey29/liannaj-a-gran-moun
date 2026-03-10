import { storage } from "../storage";

let webpush: any = null;

async function getWebPush() {
  if (!webpush) {
    try {
      webpush = await import("web-push");
    } catch {
      return null;
    }
  }
  return webpush;
}

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contact@feves.fr";
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  const { publicKey, privateKey, subject } = getVapidKeys();

  if (!publicKey || !privateKey) {
    console.warn("[PUSH] Clés VAPID non configurées - notification push non envoyée:", {
      userId,
      title: payload.title,
    });
    return;
  }

  const wp = await getWebPush();
  if (!wp) {
    console.warn("[PUSH] Module web-push non disponible");
    return;
  }

  wp.setVapidDetails(subject, publicKey, privateKey);

  const subscriptions = await storage.getPushSubscriptions(userId);
  if (subscriptions.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await wp.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadStr
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await storage.deletePushSubscription(sub.endpoint);
      } else {
        console.error("[PUSH] Erreur envoi notification:", err);
      }
    }
  }
}

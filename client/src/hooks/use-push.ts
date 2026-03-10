import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

export function usePushNotifications(enabled: boolean = true) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled || subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const subscribe = async () => {
      try {
        const res = await fetch("/api/push/vapid-key");
        const { key } = await res.json();
        if (!key) return;

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await sendSubscription(existing);
          subscribedRef.current = true;
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });

        await sendSubscription(subscription);
        subscribedRef.current = true;
      } catch (err) {
        console.warn("[PUSH] Erreur lors de la souscription:", err);
      }
    };

    subscribe();
  }, [enabled]);
}

async function sendSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  await apiRequest("POST", "/api/push/subscribe", {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

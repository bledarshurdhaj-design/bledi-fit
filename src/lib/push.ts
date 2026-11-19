"use client";
import { api } from "./api";

export type PushState =
  | "unsupported"          // shfletuesi nuk e mbështet
  | "ios-needs-install"    // iPhone: duhet shtuar në Home Screen
  | "not-configured"       // serveri nuk ka VAPID key
  | "denied"
  | "off"
  | "on";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Duhet thirrur nga një klikim i përdoruesit (kërkesë e iOS). */
export async function enablePush(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push nuk është konfiguruar në server (mungon NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Leja për njoftime nuk u dha.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key),
    });
  }
  await api("/api/push/subscribe", { subscription: sub.toJSON(), userAgent: navigator.userAgent });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("/api/push/subscribe", { endpoint: sub.endpoint }, "DELETE");
    await sub.unsubscribe();
  }
}

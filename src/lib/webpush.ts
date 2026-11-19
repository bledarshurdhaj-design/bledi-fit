import webpush from "web-push";
import { sql } from "./db";
import { HttpError } from "./errors";

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup() {
  if (configured) return;
  if (!pushConfigured()) {
    throw new HttpError(503, "Push nuk është konfiguruar në server (mungojnë VAPID keys).");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Dërgon njoftimin; abonimet e skaduara (404/410) fshihen. Kthen numrin e dërgimeve të suksesshme. */
export async function sendToSubscriptions(subs: SubRow[], payload: PushPayload) {
  setup();
  let sent = 0;
  const errors: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 3, urgency: "high" }
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sql("delete from push_subscriptions where id = $1", [s.id]);
        } else {
          errors.push(`${code ?? "?"}: ${(e as Error).message}`);
        }
      }
    })
  );
  return { sent, errors };
}

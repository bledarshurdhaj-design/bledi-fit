import { handle, HttpError, json, readJson, requireUser, str } from "@/lib/server";
import { pushConfigured } from "@/lib/webpush";

export const runtime = "nodejs";

interface SubBody {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  userAgent?: string;
  endpoint?: string;
}

const okEndpoint = (e: string) => /^https:\/\/[^\s]+$/.test(e) && e.length < 1000;

export const POST = handle(async (req) => {
  if (!pushConfigured()) throw new HttpError(503, "Push nuk është konfiguruar në server.");
  const { user, db } = await requireUser(req);
  const body = await readJson<SubBody>(req, 10_000);
  const endpoint = str(body.subscription?.endpoint, 1000);
  const p256dh = str(body.subscription?.keys?.p256dh, 200);
  const auth = str(body.subscription?.keys?.auth, 100);
  if (!okEndpoint(endpoint) || !p256dh || !auth) throw new HttpError(400, "Abonim i pavlefshëm.");

  // Nëse ky endpoint ekziston për këtë përdorues, përditësohet; përndryshe shtohet.
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  const { error } = await db.from("push_subscriptions").insert({
    user_id: user.id, endpoint, p256dh, auth, user_agent: str(body.userAgent, 300) || null,
  });
  if (error) throw new HttpError(400, error.message);
  return json({ ok: true });
});

export const DELETE = handle(async (req) => {
  const { user, db } = await requireUser(req);
  const body = await readJson<SubBody>(req, 5_000);
  const endpoint = str(body.endpoint, 1000);
  if (!endpoint) throw new HttpError(400, "Mungon endpoint.");
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return json({ ok: true });
});

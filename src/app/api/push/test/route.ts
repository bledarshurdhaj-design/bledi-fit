import { handle, HttpError, json, readJson, requireUser } from "@/lib/server";
import { sendToSubscriptions, type SubRow } from "@/lib/webpush";
import { REMINDERS, type Slot } from "@/lib/messages";

export const runtime = "nodejs";

/** Dërgon një njoftim prove te pajisjet e përdoruesit (njoftim i vërtetë push). */
export const POST = handle(async (req) => {
  const { user, db } = await requireUser(req);
  const body = await readJson<{ slot?: Slot }>(req, 1_000);
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
  if (!subs?.length) throw new HttpError(404, "Kjo pajisje nuk është e abonuar. Aktivizo njoftimet fillimisht.");
  const r = body.slot && Object.prototype.hasOwnProperty.call(REMINDERS, body.slot) ? REMINDERS[body.slot] : null;
  const result = await sendToSubscriptions(db, subs as SubRow[], {
    title: r ? r.title : "BLEDI FIT – Provë",
    body: r ? r.body : "Njoftimet funksionojnë! 💪 Qëllimi yt: 90 kg.",
    url: "/",
    tag: "test",
  });
  if (!result.sent) throw new HttpError(502, "Dërgimi dështoi: " + (result.errors[0] || "abonimi ka skaduar, aktivizo përsëri."));
  return json({ ok: true, sent: result.sent });
});

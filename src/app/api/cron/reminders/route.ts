import { adminClient, handle, HttpError, json } from "@/lib/server";
import { sendToSubscriptions, type SubRow } from "@/lib/webpush";
import { REMINDERS, slotForHour } from "@/lib/messages";
import { dateStr, hourIn } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Thirret çdo orë (Supabase pg_cron ose çdo shërbim cron).
 * Për çdo përdorues kontrollon orën lokale; në 08, 15 dhe 19 dërgon kujtuesin përkatës,
 * vetëm një herë në ditë (notification_log).
 */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "Mungon CRON_SECRET.");
  const header = req.headers.get("authorization") || "";
  if (header !== `Bearer ${secret}`) throw new HttpError(401, "I paautorizuar.");

  const db = adminClient();
  const { data: profiles, error } = await db
    .from("profiles")
    .select("user_id, timezone, remind_morning, remind_afternoon, remind_evening");
  if (error) throw new HttpError(500, error.message);

  const now = new Date();
  let sent = 0;
  const report: { user: string; slot: string; sent: number }[] = [];

  for (const p of profiles ?? []) {
    const tz = p.timezone || "Europe/Belgrade";
    const slot = slotForHour(hourIn(tz, now));
    if (!slot) continue;
    const r = REMINDERS[slot];
    if (!(p as Record<string, unknown>)[r.prefKey]) continue;

    const day = dateStr(now, tz);
    // Rezervo dërgimin (çelësi primar parandalon dublikatat)
    const { error: logErr } = await db.from("notification_log").insert({ user_id: p.user_id, slot, day });
    if (logErr) continue; // tashmë u dërgua sot

    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.user_id);
    if (!subs?.length) continue;
    const res = await sendToSubscriptions(db, subs as SubRow[], {
      title: r.title,
      body: r.body,
      url: slot === "afternoon" ? "/dua-te-ha" : "/",
      tag: `reminder-${slot}`,
    });
    sent += res.sent;
    report.push({ user: p.user_id.slice(0, 8), slot, sent: res.sent });
  }
  return json({ ok: true, sent, report, at: now.toISOString() });
}

export const GET = handle(run);
export const POST = handle(run);

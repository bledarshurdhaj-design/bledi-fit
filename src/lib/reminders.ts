import { sql } from "./db";
import { dateStr, hourIn } from "./dates";
import { REMINDERS, slotForHour } from "./messages";
import { pushConfigured, sendToSubscriptions, type SubRow } from "./webpush";

/**
 * Për çdo përdorues kontrollon orën lokale; në 08, 15 dhe 19 dërgon kujtuesin përkatës,
 * vetëm një herë në ditë (notification_log).
 */
export async function runReminders(now = new Date()) {
  if (!pushConfigured()) return { sent: 0, report: [], skipped: "push-not-configured" as const };
  const profiles = await sql<{ user_id: string; timezone: string; remind_morning: boolean; remind_afternoon: boolean; remind_evening: boolean }>(
    "select user_id, timezone, remind_morning, remind_afternoon, remind_evening from profiles"
  );
  let sent = 0;
  const report: { slot: string; sent: number }[] = [];
  for (const p of profiles) {
    const tz = p.timezone || "Europe/Belgrade";
    let hour: number;
    try { hour = hourIn(tz, now); } catch { continue; }
    const slot = slotForHour(hour);
    if (!slot) continue;
    const r = REMINDERS[slot];
    if (!(p as unknown as Record<string, boolean>)[r.prefKey]) continue;
    const subs = await sql<SubRow>("select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1", [p.user_id]);
    if (!subs.length) continue;
    // Rezervo dërgimin – çelësi primar parandalon dublikatat
    const reserved = await sql(
      "insert into notification_log (user_id, slot, day) values ($1, $2, $3) on conflict do nothing returning user_id",
      [p.user_id, slot, dateStr(now, tz)]
    );
    if (!reserved.length) continue;
    const res = await sendToSubscriptions(subs, {
      title: r.title,
      body: r.body,
      url: slot === "afternoon" ? "/dua-te-ha" : "/",
      tag: `reminder-${slot}`,
    });
    sent += res.sent;
    report.push({ slot, sent: res.sent });
  }
  return { sent, report };
}

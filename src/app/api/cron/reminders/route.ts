import { handle, HttpError, json } from "@/lib/server";
import { runReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Kujtuesit dërgohen automatikisht nga serveri (src/instrumentation.ts, çdo 5 minuta).
 * Ky endpoint shërben për kontroll manual ose për një cron të jashtëm.
 */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "Mungon CRON_SECRET.");
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) throw new HttpError(401, "I paautorizuar.");
  const result = await runReminders();
  return json({ ok: true, ...result, at: new Date().toISOString() });
}

export const GET = handle(run);
export const POST = handle(run);

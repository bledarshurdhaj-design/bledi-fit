import { ensureSchema } from "./db";
import { runReminders } from "./reminders";

export function startScheduler() {
  const g = globalThis as unknown as { __bfScheduler?: boolean };
  if (g.__bfScheduler) return;
  g.__bfScheduler = true;
  if (!process.env.DATABASE_URL) {
    console.warn("[BLEDI FIT] DATABASE_URL mungon – planifikuesi nuk u nis.");
    return;
  }
  ensureSchema().then(() => console.log("[BLEDI FIT] Databaza gati.")).catch((e) => console.error("[BLEDI FIT] Skema dështoi:", e));
  const tick = async () => {
    try {
      const r = await runReminders();
      if (r.sent) console.log(`[BLEDI FIT] Kujtues të dërguar: ${r.sent}`);
    } catch (e) {
      console.error("[BLEDI FIT] Kujtuesit dështuan:", e);
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
}

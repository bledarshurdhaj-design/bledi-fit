// Data si "YYYY-MM-DD" sipas zonës kohore (default: zona e pajisjes)
export function dateStr(d: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayStr(timeZone?: string): string {
  return dateStr(new Date(), timeZone);
}

export function hourIn(timeZone: string, d: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(d);
  return parseInt(h, 10);
}

// Punon me data të thjeshta (pa orë), në UTC që të mos ndikojë ndryshimi i orës verore
export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 1 = e hënë ... 7 = e diel
export function isoWeekday(day: string): number {
  const w = new Date(day + "T12:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}

export function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}

const DITET = ["", "E hënë", "E martë", "E mërkurë", "E enjte", "E premte", "E shtunë", "E diel"];
export function weekdayName(day: string): string {
  return DITET[isoWeekday(day)];
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${mi}`;
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

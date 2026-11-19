// Llogaritje të përbashkëta (përdoren nga aplikacioni dhe nga AI Coach në server).
// Asnjë vlerë nuk shpiket: kur mungojnë të dhënat, kthehet null.
import { addDays, dateStr, daysBetween } from "./dates";

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export interface WeightPoint {
  kg: number;
  measured_at: string;
}

export function weightsInRange(weights: WeightPoint[], from: string, to: string, tz?: string) {
  return weights.filter((w) => {
    const d = dateStr(new Date(w.measured_at), tz);
    return d >= from && d <= to;
  });
}

export function latestWeight(weights: WeightPoint[]): number | null {
  if (!weights.length) return null;
  const sorted = [...weights].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  return Number(sorted[0].kg);
}

/** Mesatarja 7-ditore e fundit krahasuar me 7 ditët para saj (trend, jo një peshim i vetëm). */
export function weightTrend(weights: WeightPoint[], today: string, tz?: string) {
  const last7 = weightsInRange(weights, addDays(today, -6), today, tz).map((w) => Number(w.kg));
  const prev7 = weightsInRange(weights, addDays(today, -13), addDays(today, -7), tz).map((w) => Number(w.kg));
  const prev14 = weightsInRange(weights, addDays(today, -20), addDays(today, -14), tz).map((w) => Number(w.kg));
  const a1 = avg(last7);
  const a2 = avg(prev7);
  const a3 = avg(prev14);
  return {
    avg_last7: a1 === null ? null : round1(a1),
    avg_prev7: a2 === null ? null : round1(a2),
    avg_prev14_20: a3 === null ? null : round1(a3),
    weighins_last7: last7.length,
    weighins_prev7: prev7.length,
    // pozitiv = humbje peshe
    weekly_loss_kg: a1 !== null && a2 !== null ? round1(a2 - a1) : null,
    two_week_loss_kg: a1 !== null && a3 !== null ? round1(a3 - a1) : null,
  };
}

export interface DayNutrition {
  kcal: number;
  protein: number;
  entries: number;
  estimated_kcal: number; // pjesa që vjen nga vlerësimi i AI (jo e matur)
}

export function nutritionByDay(
  logs: { log_date: string; kcal: number; protein: number; source: string }[]
): Record<string, DayNutrition> {
  const out: Record<string, DayNutrition> = {};
  for (const l of logs) {
    const d = (out[l.log_date] ||= { kcal: 0, protein: 0, entries: 0, estimated_kcal: 0 });
    d.kcal += Number(l.kcal);
    d.protein += Number(l.protein);
    d.entries += 1;
    if (l.source === "ai_estimate") d.estimated_kcal += Number(l.kcal);
  }
  for (const k of Object.keys(out)) {
    out[k].kcal = Math.round(out[k].kcal);
    out[k].protein = Math.round(out[k].protein);
    out[k].estimated_kcal = Math.round(out[k].estimated_kcal);
  }
  return out;
}

export function nutritionSummary(
  byDay: Record<string, DayNutrition>,
  from: string,
  to: string,
  calorieTarget: number,
  proteinMin: number
) {
  const days = Object.entries(byDay).filter(([d]) => d >= from && d <= to);
  const kcals = days.map(([, v]) => v.kcal);
  const prots = days.map(([, v]) => v.protein);
  const a = avg(kcals);
  const p = avg(prots);
  return {
    logged_days: days.length,
    total_days: daysBetween(from, to) + 1,
    avg_kcal: a === null ? null : Math.round(a),
    avg_protein: p === null ? null : Math.round(p),
    days_within_target: days.filter(([, v]) => v.kcal <= calorieTarget * 1.05).length,
    days_over_target_10pct: days.filter(([, v]) => v.kcal > calorieTarget * 1.1).length,
    days_protein_reached: days.filter(([, v]) => v.protein >= proteinMin).length,
  };
}

export interface Adjustment {
  field: "calorie_target";
  old_value: number;
  new_value: number;
  reason: string;
}

/**
 * Sugjerim i matur për kaloritë – vetëm kur ka mjaft të dhëna reale.
 * Objektivi: rreth 0.5–0.9 kg në javë. Asnjëherë nën 1900 kcal, ndryshim maksimal 150 kcal.
 */
export function suggestCalorieAdjustment(input: {
  trend: ReturnType<typeof weightTrend>;
  nutrition: ReturnType<typeof nutritionSummary>;
  calorieTarget: number;
}): Adjustment | null {
  const { trend, nutrition, calorieTarget } = input;
  if (trend.two_week_loss_kg === null || trend.weighins_last7 < 3) return null;
  if (nutrition.logged_days < 5 || nutrition.avg_kcal === null) return null;
  const weekly = trend.two_week_loss_kg / 2;
  const adherent = nutrition.avg_kcal <= calorieTarget * 1.08;
  if (!adherent) return null; // nëse kaloritë janë mbi plan, zgjidhja është zbatimi, jo ulja e objektivit
  if (weekly < 0.3) {
    const nv = Math.max(1900, calorieTarget - 150);
    if (nv === calorieTarget) return null;
    return {
      field: "calorie_target",
      old_value: calorieTarget,
      new_value: nv,
      reason: `Në 2 javët e fundit trendi mesatar është ${round1(weekly)} kg/javë, nën objektivin 0.5–0.9 kg, ndërkohë që mesatarja e kalorive (${nutrition.avg_kcal} kcal) është brenda planit. Një ulje e vogël prej ${calorieTarget - nv} kcal është e sigurt.`,
    };
  }
  if (weekly > 1.1) {
    const nv = Math.min(3500, calorieTarget + 150);
    return {
      field: "calorie_target",
      old_value: calorieTarget,
      new_value: nv,
      reason: `Po humb rreth ${round1(weekly)} kg/javë – më shpejt se 0.9 kg. Për të ruajtur muskujt dhe energjinë në stërvitje, rritja e kalorive me ${nv - calorieTarget} kcal është e arsyeshme.`,
    };
  }
  return null;
}

import type { Profile } from "./types";

type Field = "calorie_target" | "protein_min" | "protein_max" | "cardio_minutes";

const RULES: Record<Field, { min: number; max: number; maxDelta: number }> = {
  calorie_target: { min: 1900, max: 3500, maxDelta: 250 },
  protein_min: { min: 140, max: 230, maxDelta: 20 },
  protein_max: { min: 150, max: 240, maxDelta: 20 },
  cardio_minutes: { min: 0, max: 45, maxDelta: 10 },
};

export function isField(f: unknown): f is Field {
  return typeof f === "string" && Object.prototype.hasOwnProperty.call(RULES, f);
}

/** Kufij sigurie – edhe nëse AI propozon diçka ekstreme, serveri e refuzon. */
export function validateChange(field: Field, newValue: number, p: Profile): string | null {
  const r = RULES[field];
  const old = Number(p[field]);
  if (!Number.isFinite(newValue)) return "Vlerë e pavlefshme.";
  if (newValue < r.min || newValue > r.max) return `Vlera duhet të jetë ${r.min}–${r.max}.`;
  if (Math.abs(newValue - old) > r.maxDelta) return `Ndryshimi maksimal i lejuar është ±${r.maxDelta}.`;
  if (newValue === old) return "Vlera është e njëjtë me atë aktuale.";
  if (field === "protein_min" && newValue > p.protein_max) return "Proteina minimale s'mund të kalojë maksimalen.";
  if (field === "protein_max" && newValue < p.protein_min) return "Proteina maksimale s'mund të jetë nën minimalen.";
  return null;
}

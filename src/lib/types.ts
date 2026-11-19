export interface Profile {
  user_id: string;
  display_name: string;
  start_weight: number;
  target_weight: number;
  height_cm: number;
  age: number;
  training_days: number;
  cardio_minutes: number;
  calorie_target: number;
  protein_min: number;
  protein_max: number;
  training_time: string;
  food_preferences: string;
  main_problem: string;
  timezone: string;
  remind_morning: boolean;
  remind_afternoon: boolean;
  remind_evening: boolean;
}

export interface WeightEntry {
  id: number;
  kg: number;
  measured_at: string;
  note?: string | null;
}

export interface Food {
  id: number;
  user_id: string | null;
  code: string | null;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portion_grams: number | null;
  portion_label: string | null;
  source: string;
}

export interface FoodLog {
  id: number;
  food_id: number | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "database" | "custom" | "ai_estimate";
  log_date: string;
  eaten_at: string;
}

export interface WorkoutSession {
  id: number;
  session_date: string;
  day_key: string;
  done: number[];
  completed: boolean;
  completed_at: string | null;
}

export interface CardioSession {
  session_date: string;
  minutes: number;
  completed: boolean;
}

export interface Checklist {
  day: string;
  bike: boolean;
  food_plan: boolean;
  protein: boolean;
  workout: boolean;
  water: boolean;
}

export interface PlanProposal {
  id: number;
  field: "calorie_target" | "protein_min" | "protein_max" | "cardio_minutes";
  old_value: number;
  new_value: number;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export const FIELD_LABELS: Record<PlanProposal["field"], string> = {
  calorie_target: "Kaloritë ditore (kcal)",
  protein_min: "Proteina minimale (g)",
  protein_max: "Proteina maksimale (g)",
  cardio_minutes: "Kardio në mëngjes (min)",
};

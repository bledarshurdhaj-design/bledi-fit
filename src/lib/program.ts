export type DayKey = "upper_a" | "lower_a" | "upper_b" | "lower_b";

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

export interface WorkoutDay {
  key: DayKey;
  title: string;
  weekday: number; // 1 = e hënë
  exercises: Exercise[];
}

export const PROGRAM: WorkoutDay[] = [
  {
    key: "upper_a",
    title: "Trupi i sipërm A",
    weekday: 1,
    exercises: [
      { name: "Shtypje në stol me shufër (Bench press)", sets: 4, reps: "6–8" },
      { name: "Tërheqje me shufër (Barbell row)", sets: 4, reps: "8–10" },
      { name: "Shtypje mbi kokë (Overhead press)", sets: 3, reps: "8–10" },
      { name: "Tërheqje vertikale (Lat pulldown)", sets: 3, reps: "10–12" },
      { name: "Biceps me shufër (Curl)", sets: 2, reps: "10–12" },
      { name: "Triceps në kabëll (Pushdown)", sets: 2, reps: "10–12" },
    ],
  },
  {
    key: "lower_a",
    title: "Trupi i poshtëm A",
    weekday: 2,
    exercises: [
      { name: "Squat me shufër", sets: 4, reps: "6–8" },
      { name: "Deadlift rumun (RDL)", sets: 3, reps: "8–10" },
      { name: "Shtypje këmbësh (Leg press)", sets: 3, reps: "10–12" },
      { name: "Përkulje këmbësh (Leg curl)", sets: 3, reps: "10–12" },
      { name: "Ngritje në gishta (Calf raise)", sets: 3, reps: "12–15" },
      { name: "Plank", sets: 3, reps: "30–45 sek" },
    ],
  },
  {
    key: "upper_b",
    title: "Trupi i sipërm B",
    weekday: 4,
    exercises: [
      { name: "Shtypje e pjerrët me shtanga (Incline DB press)", sets: 4, reps: "8–10" },
      { name: "Tërheqje në hekur (Pull-up / me ndihmë)", sets: 4, reps: "6–10" },
      { name: "Tërheqje ulur në kabëll (Seated row)", sets: 3, reps: "10–12" },
      { name: "Ngritje anësore (Lateral raise)", sets: 3, reps: "12–15" },
      { name: "Biceps çekiç (Hammer curl)", sets: 2, reps: "10–12" },
      { name: "Triceps mbi kokë", sets: 2, reps: "10–12" },
    ],
  },
  {
    key: "lower_b",
    title: "Trupi i poshtëm B",
    weekday: 5,
    exercises: [
      { name: "Deadlift", sets: 3, reps: "5" },
      { name: "Squat bullgar (Bulgarian split squat)", sets: 3, reps: "8–10 / këmbë" },
      { name: "Hip thrust", sets: 3, reps: "8–10" },
      { name: "Shtrirje këmbësh (Leg extension)", sets: 3, reps: "12–15" },
      { name: "Ngritje në gishta (Calf raise)", sets: 3, reps: "12–15" },
      { name: "Ngritje gjunjësh në hekur", sets: 3, reps: "10–12" },
    ],
  },
];

export function workoutForWeekday(weekday: number): WorkoutDay | null {
  return PROGRAM.find((d) => d.weekday === weekday) ?? null;
}

export function workoutByKey(key: string): WorkoutDay | null {
  return PROGRAM.find((d) => d.key === key) ?? null;
}

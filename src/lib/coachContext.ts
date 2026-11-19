import type { Db } from "./qb";
import { addDays, dateStr, hourIn, isoWeekday, todayStr, weekdayName } from "./dates";
import { PROGRAM, workoutForWeekday } from "./program";
import {
  latestWeight, nutritionByDay, nutritionSummary, round1, suggestCalorieAdjustment, weightTrend,
} from "./stats";
import type { Profile } from "./types";
import { HttpError } from "./errors";

/** Ngarkon të dhënat REALE të përdoruesit dhe i përmbledh për AI Coach. */
export async function buildCoachContext(db: Db, userId: string) {
  const { data: profile, error: pErr } = await db.from("profiles").select("*").eq("user_id", userId).single();
  if (pErr || !profile) throw new HttpError(404, "Profili nuk u gjet.");
  const p = profile as Profile;
  const tz = p.timezone || "Europe/Belgrade";
  const today = todayStr(tz);
  const from = addDays(today, -34);
  const fromIso = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString();

  const [weights, logs, workouts, cardio, checklist, checkins, cravings, firstWeight, pending] = await Promise.all([
    db.from("weights").select("kg, measured_at").gte("measured_at", fromIso).order("measured_at"),
    db.from("food_logs").select("log_date, name, grams, kcal, protein, source, eaten_at").gte("log_date", from).order("eaten_at"),
    db.from("workout_sessions").select("session_date, day_key, done, completed").gte("session_date", from),
    db.from("cardio_sessions").select("session_date, minutes, completed").gte("session_date", from),
    db.from("daily_checklist").select("*").gte("day", addDays(today, -6)),
    db.from("daily_checkins").select("day, hunger, energy, note").gte("day", addDays(today, -6)),
    db.from("craving_events").select("kind, created_at").gte("created_at", new Date(Date.now() - 28 * 86400000).toISOString()),
    db.from("weights").select("kg, measured_at").order("measured_at").limit(1),
    db.from("plan_proposals").select("field, new_value, reason").eq("status", "pending"),
  ]);
  for (const r of [weights, logs, workouts, cardio, checklist, checkins, cravings, firstWeight, pending]) {
    if (r.error) throw new HttpError(500, "Gabim gjatë leximit të të dhënave: " + r.error.message);
  }

  const W = (weights.data ?? []).map((w) => ({ kg: Number(w.kg), measured_at: w.measured_at as string }));
  const L = (logs.data ?? []) as { log_date: string; name: string; grams: number; kcal: number; protein: number; source: string; eaten_at: string }[];
  const byDay = nutritionByDay(L);
  const todayN = byDay[today] ?? { kcal: 0, protein: 0, entries: 0, estimated_kcal: 0 };
  const trend = weightTrend(W, today, tz);
  const last7 = nutritionSummary(byDay, addDays(today, -6), today, p.calorie_target, p.protein_min);
  const prev7 = nutritionSummary(byDay, addDays(today, -13), addDays(today, -7), p.calorie_target, p.protein_min);
  const latest = latestWeight(W);

  // Stërvitja: sa seanca ishin planifikuar dhe sa u kryen në 7 ditët e fundit
  let scheduled7 = 0;
  for (let i = 0; i < 7; i++) if (workoutForWeekday(isoWeekday(addDays(today, -i)))) scheduled7++;
  const WS = (workouts.data ?? []) as { session_date: string; day_key: string; done: number[]; completed: boolean }[];
  const CS = (cardio.data ?? []) as { session_date: string; minutes: number; completed: boolean }[];
  const in7 = (d: string) => d >= addDays(today, -6) && d <= today;
  const todaysWorkout = workoutForWeekday(isoWeekday(today));
  const todaysSession = WS.find((w) => w.session_date === today);

  // Modelet e dëshirave për ushqim (nga butoni "DUA TË HA")
  const CR = (cravings.data ?? []) as { kind: string; created_at: string }[];
  const byTime = { mengjes_6_12: 0, pasdite_12_17: 0, mbremje_17_22: 0, nate_22_6: 0 };
  const byWeekday: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const c of CR) {
    if (c.kind === "opened") continue;
    const h = hourIn(tz, new Date(c.created_at));
    if (h >= 6 && h < 12) byTime.mengjes_6_12++;
    else if (h >= 12 && h < 17) byTime.pasdite_12_17++;
    else if (h >= 17 && h < 22) byTime.mbremje_17_22++;
    else byTime.nate_22_6++;
    const wd = weekdayName(dateStr(new Date(c.created_at), tz));
    byWeekday[wd] = (byWeekday[wd] ?? 0) + 1;
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  }
  const overDays = Object.entries(byDay)
    .filter(([d, v]) => d >= addDays(today, -27) && v.kcal > p.calorie_target * 1.15)
    .map(([d]) => weekdayName(d));

  const missing: string[] = [];
  if (!W.length) missing.push("Nuk ka asnjë peshim në 35 ditët e fundit.");
  else if (trend.weighins_last7 < 3) missing.push(`Vetëm ${trend.weighins_last7} peshime në 7 ditët e fundit – trendi është i pasigurt.`);
  if (last7.logged_days < 4) missing.push(`Ushqimi është regjistruar vetëm ${last7.logged_days} nga 7 ditë.`);
  if (todayN.entries === 0) missing.push("Sot nuk është regjistruar ende asnjë ushqim.");

  const plateau =
    trend.two_week_loss_kg !== null && trend.weighins_last7 >= 3 && Math.abs(trend.two_week_loss_kg) < 0.3;

  return {
    profile: p,
    today,
    tz,
    context: {
      data_sot: today,
      dita_e_javes: weekdayName(today),
      ora_lokale: hourIn(tz),
      profili: {
        emri: p.display_name,
        mosha: p.age,
        gjatesia_cm: p.height_cm,
        pesha_fillestare_ne_profil_kg: Number(p.start_weight),
        pesha_objektiv_kg: Number(p.target_weight),
        kalori_objektiv_kcal: p.calorie_target,
        proteina_objektiv_g: `${p.protein_min}–${p.protein_max}`,
        kardio_mengjes_min: p.cardio_minutes,
        stervitje_dite_ne_jave: p.training_days,
        ora_stervitjes: p.training_time,
        ushqime_te_preferuara: p.food_preferences,
        problemi_kryesor: p.main_problem,
      },
      pesha_E_MATUR: {
        peshimi_i_pare_ever: firstWeight.data?.[0] ? { kg: Number(firstWeight.data[0].kg), data: dateStr(new Date(firstWeight.data[0].measured_at), tz) } : null,
        peshimi_i_fundit_kg: latest,
        mbeten_deri_te_objektivi_kg: latest !== null ? round1(latest - Number(p.target_weight)) : null,
        mesatarja_7_ditet_e_fundit: trend.avg_last7,
        mesatarja_7_ditet_paraprake: trend.avg_prev7,
        mesatarja_dite_14_20_me_pare: trend.avg_prev14_20,
        humbja_javore_kg_pozitiv_eshte_humbje: trend.weekly_loss_kg,
        humbja_2_javore_kg: trend.two_week_loss_kg,
        numri_peshimeve_7_dite: trend.weighins_last7,
        mundesi_plateau: plateau,
        peshimet_e_fundit: W.slice(-10).map((w) => ({ data: dateStr(new Date(w.measured_at), tz), kg: w.kg })),
      },
      ushqimi_sot: {
        kalori: todayN.kcal,
        nga_te_cilat_kalori_te_vleresuara_nga_AI: todayN.estimated_kcal,
        proteina_g: todayN.protein,
        kalori_te_mbetura: p.calorie_target - todayN.kcal,
        proteina_e_mbetur_deri_ne_minimum_g: Math.max(0, p.protein_min - todayN.protein),
        regjistrimet: L.filter((l) => l.log_date === today).map((l) => ({
          ora: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(l.eaten_at)),
          ushqimi: l.name,
          gram: Number(l.grams),
          kcal: Math.round(Number(l.kcal)),
          proteina: Math.round(Number(l.protein)),
          burimi: l.source === "ai_estimate" ? "VLERËSIM AI" : "databazë/i matur",
        })),
      },
      ushqimi_7_ditet_e_fundit: last7,
      ushqimi_7_ditet_paraprake: prev7,
      ushqimi_dite_pas_dite_14: Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, -i);
        const n = byDay[d];
        return n ? { data: d, kcal: n.kcal, proteina: n.protein, kcal_te_vleresuara: n.estimated_kcal } : { data: d, pa_regjistrim: true };
      }),
      stervitja: {
        program: PROGRAM.map((d) => `${weekdayName(addDays("2024-01-01", d.weekday - 1))}: ${d.title}`),
        sot_e_planifikuar: todaysWorkout ? todaysWorkout.title : "Ditë pushimi",
        sot_e_perfunduar: Boolean(todaysSession?.completed),
        seanca_te_planifikuara_7_dite: scheduled7,
        seanca_te_perfunduara_7_dite: WS.filter((w) => in7(w.session_date) && w.completed).length,
        seanca_te_perfunduara_7_dite_paraprake: WS.filter((w) => w.session_date >= addDays(today, -13) && w.session_date <= addDays(today, -7) && w.completed).length,
      },
      kardio: {
        sot_e_perfunduar: Boolean(CS.find((c) => c.session_date === today)?.completed),
        perfunduar_7_dite: CS.filter((c) => in7(c.session_date) && c.completed).length,
      },
      lista_ditore_7_dite: checklist.data ?? [],
      checkin_uria_energjia_1_5: checkins.data ?? [],
      deshirat_per_ushqim_28_dite: {
        total: CR.filter((c) => c.kind !== "opened").length,
        sipas_llojit: byKind,
        sipas_ores: byTime,
        sipas_dites: byWeekday,
        ditet_mbi_115pct_te_objektivit: overDays,
      },
      sugjerim_rregulli_automatik: suggestCalorieAdjustment({ trend, nutrition: last7, calorieTarget: p.calorie_target }),
      propozime_ne_pritje: pending.data ?? [],
      te_dhena_qe_mungojne: missing,
    },
  };
}

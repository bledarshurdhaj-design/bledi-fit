"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/Providers";
import { ErrorBox, Loading, PageHeader, ProgressBar, Toast, useToast } from "@/components/ui";
import LineChart from "@/components/LineChart";
import { sb, check } from "@/lib/dbClient";
import { api } from "@/lib/api";
import { addDays, dateStr, formatDay, isoWeekday, mondayOf, todayStr } from "@/lib/dates";
import { workoutForWeekday } from "@/lib/program";
import {
  avg, latestWeight, nutritionByDay, nutritionSummary, round1, suggestCalorieAdjustment, weightTrend, weightsInRange,
} from "@/lib/stats";
import type { CardioSession, Checklist, FoodLog, WeightEntry, WorkoutSession } from "@/lib/types";

interface Data { weights: WeightEntry[]; logs: FoodLog[]; workouts: WorkoutSession[]; cardio: CardioSession[]; checklist: Checklist[]; }

export default function ProgressPage() {
  const { profile, reloadProfile } = useApp();
  const today = todayStr();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = addDays(today, -90);
      const [w, l, ws, c, cl] = await Promise.all([
        sb().from("weights").select("id, kg, measured_at").gte("measured_at", new Date(from + "T00:00:00").toISOString()).order("measured_at"),
        sb().from("food_logs").select("log_date, kcal, protein, source").gte("log_date", addDays(today, -20)),
        sb().from("workout_sessions").select("*").gte("session_date", addDays(today, -20)),
        sb().from("cardio_sessions").select("*").gte("session_date", addDays(today, -20)),
        sb().from("daily_checklist").select("*").gte("day", addDays(today, -6)),
      ]);
      setD({
        weights: (check(w) as WeightEntry[]).map((x) => ({ ...x, kg: Number(x.kg) })),
        logs: check(l) as FoodLog[],
        workouts: check(ws) as WorkoutSession[],
        cardio: check(c) as CardioSession[],
        checklist: check(cl) as Checklist[],
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="page"><PageHeader title="📈 Progresi im" /><ErrorBox error={error} onRetry={load} />{!error && <Loading />}</div>;

  // ---- Raporti i javës (e hënë → sot) ----
  const mon = mondayOf(today);
  const weekW = weightsInRange(d.weights, mon, today);
  const prevW = weightsInRange(d.weights, addDays(mon, -7), addDays(mon, -1));
  const startOfWeek = weekW.length ? weekW[0].kg : null;
  const weekAvg = avg(weekW.map((w) => w.kg));
  const prevAvg = avg(prevW.map((w) => w.kg));
  const change = weekAvg !== null && prevAvg !== null ? round1(weekAvg - prevAvg) : startOfWeek !== null && weekAvg !== null ? round1(weekAvg - startOfWeek) : null;
  const byDay = nutritionByDay(d.logs);
  const nWeek = nutritionSummary(byDay, mon, today, profile.calorie_target, profile.protein_min);
  const daysSoFar = isoWeekday(today);
  let scheduled = 0;
  for (let i = 0; i < daysSoFar; i++) if (workoutForWeekday(i + 1)) scheduled++;
  const trainings = d.workouts.filter((w) => w.session_date >= mon && w.completed).length;
  const cardios = d.cardio.filter((c) => c.session_date >= mon && c.completed).length;

  // ---- Sugjerimi i kalorive (rolling 14 ditë) ----
  const trend = weightTrend(d.weights, today);
  const n7 = nutritionSummary(byDay, addDays(today, -6), today, profile.calorie_target, profile.protein_min);
  const suggestion = suggestCalorieAdjustment({ trend, nutrition: n7, calorieTarget: profile.calorie_target });

  const latest = latestWeight(d.weights);
  const points = d.weights.map((w) => ({ x: dateStr(new Date(w.measured_at)), y: w.kg }));
  const totalLost = latest !== null ? round1(Number(profile.start_weight) - latest) : null;

  async function applySuggestion() {
    if (!suggestion) return;
    if (!confirm(`Të ndryshohet objektivi ditor nga ${suggestion.old_value} në ${suggestion.new_value} kcal?`)) return;
    setBusy(true);
    try {
      await api("/api/coach/proposal", { action: "apply_rule" });
      await reloadProfile();
      showToast("✓ Objektivi i kalorive u përditësua");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="📈 Progresi im" />
      <ErrorBox error={error} onRetry={load} />

      <div className="card">
        <div className="stats">
          <div className="stat"><div className="v">{latest !== null ? latest.toFixed(1) : "–"}</div><div className="l">Pesha e fundit</div></div>
          <div className="stat"><div className="v" style={{ color: "#86efac" }}>{totalLost !== null ? (totalLost >= 0 ? "−" : "+") + Math.abs(totalLost).toFixed(1) : "–"}</div><div className="l">nga {Number(profile.start_weight)} kg</div></div>
          <div className="stat"><div className="v">{latest !== null ? Math.max(0, round1(latest - Number(profile.target_weight))).toFixed(1) : "–"}</div><div className="l">kg deri në {Number(profile.target_weight)}</div></div>
        </div>
        <div className="mt"><LineChart points={points} target={Number(profile.target_weight)} /></div>
      </div>

      <div className="card">
        <h2>Raporti javor</h2>
        <div className="tiny muted mb">{formatDay(mon)} – {formatDay(today)}</div>
        <Row label="Pesha në fillim të javës" value={startOfWeek !== null ? `${startOfWeek.toFixed(1)} kg` : "–"} />
        <Row label="Mesatarja e kësaj jave" value={weekAvg !== null ? `${round1(weekAvg).toFixed(1)} kg` : "–"} />
        <Row label={prevAvg !== null ? "Ndryshimi nga java e kaluar" : "Ndryshimi gjatë javës"}
          value={change !== null ? `${change <= 0 ? "−" : "+"}${Math.abs(change).toFixed(1)} kg` : "–"} good={change !== null && change < 0} />
        <Row label="Stërvitje të kryera" value={`${trainings} / ${scheduled}`} good={scheduled > 0 && trainings >= scheduled} />
        <Row label="Kardio të kryera" value={`${cardios} / ${daysSoFar}`} />
        <Row label="Kalori mesatare ditore" value={nWeek.avg_kcal !== null ? `${nWeek.avg_kcal} kcal` : "–"} />
        <Row label="Proteina mesatare" value={nWeek.avg_protein !== null ? `${nWeek.avg_protein} g` : "–"} good={(nWeek.avg_protein ?? 0) >= profile.protein_min} />
        <p className="tiny muted mt">Mesataret llogariten vetëm nga ditët me regjistrime ({nWeek.logged_days}/{nWeek.total_days}). Ritmi i qëndrueshëm: rreth 0.5–0.9 kg në javë – jo 2 kg.</p>
      </div>

      {suggestion && !dismissed && (
        <div className="notice info">
          <b>Sugjerim: {suggestion.old_value} → {suggestion.new_value} kcal/ditë</b>
          <div className="small mt">{suggestion.reason}</div>
          <div className="tiny muted mt">Asgjë nuk ndryshon pa miratimin tënd.</div>
          <div className="row mt">
            <button className="btn small green grow" onClick={applySuggestion} disabled={busy}>Prano ndryshimin</button>
            <button className="btn small secondary grow" onClick={() => setDismissed(true)}>Jo tani</button>
          </div>
        </div>
      )}
      {!suggestion && (
        <div className="notice soft small">
          {trend.two_week_loss_kg === null
            ? "Rregullimi i kalorive bëhet pas 2–3 javësh me peshime të rregullta dhe regjistrime ushqimi."
            : `Trendi 2-javor: ${trend.two_week_loss_kg >= 0 ? "−" : "+"}${Math.abs(trend.two_week_loss_kg).toFixed(1)} kg. Nuk nevojitet ndryshim i objektivit tani.`}
        </div>
      )}

      <div className="card">
        <h2>Lista ditore – 7 ditët e fundit</h2>
        {Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i)).map((day) => {
          const c = d.checklist.find((x) => x.day === day);
          const keys: (keyof Checklist)[] = ["bike", "food_plan", "protein", "water", ...(workoutForWeekday(isoWeekday(day)) ? ["workout" as const] : [])];
          const pct = c ? keys.filter((k) => c[k] === true).length / keys.length : 0;
          return (
            <div key={day} className="row mb">
              <span className="small" style={{ width: 54 }}>{formatDay(day).slice(0, 5)}</span>
              <div className="grow"><ProgressBar value={pct} green /></div>
              <span className="small" style={{ width: 42, textAlign: "right" }}>{Math.round(pct * 100)}%</span>
            </div>
          );
        })}
      </div>
      <Toast msg={toast} />
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="muted">{label}</span>
      <b style={{ color: good ? "#86efac" : "#fff" }}>{value}</b>
    </div>
  );
}

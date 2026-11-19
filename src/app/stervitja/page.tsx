"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/Providers";
import { Check, ErrorBox, Loading, PageHeader, ProgressBar, Toast, useToast } from "@/components/ui";
import { sb, check } from "@/lib/dbClient";
import { addDays, isoWeekday, todayStr, weekdayName } from "@/lib/dates";
import { PROGRAM, workoutByKey, workoutForWeekday, type DayKey } from "@/lib/program";
import type { CardioSession, WorkoutSession } from "@/lib/types";

export default function WorkoutPage() {
  const { profile, user } = useApp();
  const today = todayStr();
  const scheduled = workoutForWeekday(isoWeekday(today));
  const [dayKey, setDayKey] = useState<DayKey | null>(scheduled?.key ?? null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [cardio, setCardio] = useState<CardioSession | null>(null);
  const [week, setWeek] = useState<{ w: WorkoutSession[]; c: CardioSession[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = addDays(today, -6);
      const [w, c] = await Promise.all([
        sb().from("workout_sessions").select("*").gte("session_date", from).order("session_date"),
        sb().from("cardio_sessions").select("*").gte("session_date", from).order("session_date"),
      ]);
      const ws = check(w) as WorkoutSession[];
      const cs = check(c) as CardioSession[];
      setWeek({ w: ws, c: cs });
      const t = ws.find((s) => s.session_date === today) ?? null;
      setSession(t);
      if (t) setDayKey(t.day_key as DayKey);
      setCardio(cs.find((s) => s.session_date === today) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const day = dayKey ? workoutByKey(dayKey) : null;
  const done = session && session.day_key === dayKey ? session.done : [];

  async function saveSession(patch: Partial<WorkoutSession>) {
    if (!dayKey) return;
    const row = { user_id: user.id, session_date: today, day_key: dayKey, done, completed: false, ...patch };
    const { data, error } = await sb().from("workout_sessions").upsert(row, { onConflict: "user_id,session_date" }).select("*").single();
    if (error) throw new Error(navigator.onLine ? error.message : "Je offline – nuk u ruajt.");
    setSession(data as WorkoutSession);
  }

  async function toggleExercise(i: number, v: boolean) {
    const next = v ? Array.from(new Set([...done, i])) : done.filter((x) => x !== i);
    try { await saveSession({ done: next, completed: session?.completed ?? false }); } catch (e) { setError((e as Error).message); }
  }

  async function complete() {
    if (!day) return;
    setBusy(true);
    try {
      await saveSession({ done: day.exercises.map((_, i) => i), completed: true, completed_at: new Date().toISOString() });
      await sb().from("daily_checklist").upsert({ user_id: user.id, day: today, workout: true });
      showToast("💪 Stërvitja u krye! Bravo!");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setCardioDone(v: boolean) {
    try {
      const { data, error } = await sb().from("cardio_sessions")
        .upsert({ user_id: user.id, session_date: today, minutes: profile.cardio_minutes, completed: v }, { onConflict: "user_id,session_date" })
        .select("*").single();
      if (error) throw new Error(navigator.onLine ? error.message : "Je offline – nuk u ruajt.");
      setCardio(data as CardioSession);
      await sb().from("daily_checklist").upsert({ user_id: user.id, day: today, bike: v });
      if (v) showToast("🚲 Kardio e mëngjesit – kryer!");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cardioDone = Boolean(cardio?.completed);

  return (
    <div className="page">
      <PageHeader title="🏋️ Stërvitja" />
      <ErrorBox error={error} onRetry={load} />

      <div className="card">
        <h2>🚲 Biçikletë në mëngjes – {profile.cardio_minutes} min</h2>
        <div className="row">
          <button className={`btn grow ${cardioDone ? "green" : "secondary"}`} onClick={() => setCardioDone(true)}>✓ Kryer</button>
          <button className={`btn grow ${!cardioDone && cardio ? "" : "secondary"}`} onClick={() => setCardioDone(false)}>✗ Jo</button>
        </div>
      </div>

      <div className="card">
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{weekdayName(today)}</h2>
          {session?.completed && <span className="badge green">KRYER ✓</span>}
        </div>
        {!scheduled && !session && (
          <p className="muted small">Sot është ditë pushimi 😌 Rikuperimi është pjesë e progresit. Nëse e ke zhvendosur stërvitjen, zgjidhe më poshtë.</p>
        )}
        <select className="input" value={dayKey ?? ""} disabled={Boolean(session?.completed)}
          onChange={(e) => setDayKey((e.target.value || null) as DayKey | null)}>
          <option value="">— Pushim —</option>
          {PROGRAM.map((d) => <option key={d.key} value={d.key}>{weekdayName(addDays("2024-01-01", d.weekday - 1))}: {d.title}</option>)}
        </select>

        {day && (
          <div className="mt">
            <ProgressBar value={done.length / day.exercises.length} green />
            <div className="mt">
              {day.exercises.map((ex, i) => (
                <Check key={i} on={done.includes(i)} onChange={(v) => toggleExercise(i, v)} disabled={session?.completed}
                  label={<><b>{ex.name}</b><div className="small muted">{ex.sets} seri × {ex.reps}</div></>} />
              ))}
            </div>
            {!session?.completed && (
              <button className="btn green block mt" style={{ minHeight: 64, fontSize: 19 }} onClick={complete} disabled={busy}>
                {busy ? <span className="spinner" /> : "✓ STËRVITJA U KRYE"}
              </button>
            )}
            <p className="tiny muted mt">Pusho 1.5–3 min te ushtrimet e rënda. Lëre 1–2 përsëritje “në rezervë”. Kur i bën të gjitha seritë lehtë, shto pak peshë.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>7 ditët e fundit</h2>
        {!week ? <Loading /> : (
          <>
            <div className="row between"><span className="muted">Stërvitje të kryera</span><b>{week.w.filter((w) => w.completed).length}</b></div>
            <div className="row between mt"><span className="muted">Kardio të kryera</span><b>{week.c.filter((c) => c.completed).length}</b></div>
          </>
        )}
      </div>
      <Toast msg={toast} />
    </div>
  );
}

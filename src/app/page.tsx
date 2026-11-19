"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/Providers";
import { Check, ErrorBox, ProgressBar } from "@/components/ui";
import { sb, check } from "@/lib/dbClient";
import { isoWeekday, todayStr } from "@/lib/dates";
import { workoutForWeekday } from "@/lib/program";
import { activeInAppSlot, REMINDERS } from "@/lib/messages";
import { round1 } from "@/lib/stats";
import type { Checklist } from "@/lib/types";

type CKey = "bike" | "food_plan" | "protein" | "workout" | "water";

export default function Dashboard() {
  const { profile, user } = useApp();
  const today = todayStr();
  const [latest, setLatest] = useState<number | null>(null);
  const [kcal, setKcal] = useState(0);
  const [protein, setProtein] = useState(0);
  const [cl, setCl] = useState<Checklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<keyof typeof REMINDERS | null>(null);
  const scheduled = workoutForWeekday(isoWeekday(today));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, logs, c] = await Promise.all([
        sb().from("weights").select("kg").order("measured_at", { ascending: false }).limit(1),
        sb().from("food_logs").select("kcal, protein").eq("log_date", today),
        sb().from("daily_checklist").select("*").eq("day", today).maybeSingle(),
      ]);
      const wd = check(w);
      setLatest(wd.length ? Number(wd[0].kg) : null);
      const ld = check(logs);
      const k = ld.reduce((a, l) => a + Number(l.kcal), 0);
      const p = ld.reduce((a, l) => a + Number(l.protein), 0);
      setKcal(Math.round(k));
      setProtein(Math.round(p));
      let cd = check(c) as Checklist | null;
      // Proteina e arritur → shënohet automatikisht
      if (p >= profile.protein_min && !cd?.protein) {
        const up = await sb().from("daily_checklist").upsert({ user_id: user.id, day: today, protein: true }).select("*").single();
        if (!up.error) cd = up.data as Checklist;
      }
      setCl(cd ?? { day: today, bike: false, food_plan: false, protein: false, workout: false, water: false });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today, profile.protein_min, user.id]);

  useEffect(() => { load(); }, [load]);

  // Kujtues brenda aplikacionit (rezervë nëse push nuk është aktiv)
  useEffect(() => {
    const slot = activeInAppSlot(new Date().getHours());
    if (!slot) return;
    const pref = REMINDERS[slot].prefKey as keyof typeof profile;
    if (!profile[pref]) return;
    try {
      if (localStorage.getItem(`reminder-${today}-${slot}`)) return;
    } catch { /* ignore */ }
    setReminder(slot);
  }, [today, profile]);

  function dismissReminder() {
    try { localStorage.setItem(`reminder-${today}-${reminder}`, "1"); } catch { /* ignore */ }
    setReminder(null);
  }

  async function toggle(key: CKey, v: boolean) {
    if (!cl) return;
    const prev = cl;
    setCl({ ...cl, [key]: v });
    const { error } = await sb().from("daily_checklist").upsert({ user_id: user.id, day: today, [key]: v });
    if (error) { setCl(prev); setError(navigator.onLine ? error.message : "Je offline – nuk u ruajt."); }
  }

  const current = latest ?? Number(profile.start_weight);
  const start = Number(profile.start_weight);
  const target = Number(profile.target_weight);
  const remaining = round1(Math.max(0, current - target));
  const progress = start > target ? (start - current) / (start - target) : 0;
  const kcalLeft = profile.calorie_target - kcal;

  const items: { key: CKey; label: string }[] = [
    { key: "bike", label: `🚲 Biçikleta e mëngjesit (${profile.cardio_minutes} min)` },
    { key: "food_plan", label: "🥗 Ndoqa planin e ushqimit" },
    { key: "protein", label: `🍗 Arrita proteinën (${profile.protein_min} g)` },
    ...(scheduled ? [{ key: "workout" as CKey, label: `🏋️ Stërvitja – ${scheduled.title}` }] : []),
    { key: "water", label: "💧 Piva mjaftueshëm ujë" },
  ];
  const done = cl ? items.filter((i) => cl[i.key]).length : 0;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">BLEDI <span>FIT</span></div>
        <Link href="/cilesimet" className="icon-btn" aria-label="Cilësimet">⚙️</Link>
      </div>

      <ErrorBox error={error} onRetry={load} />

      {reminder && (
        <div className="notice info">
          <b>{REMINDERS[reminder].title}</b>
          <div className="mt small">{REMINDERS[reminder].body}</div>
          <div className="row mt">
            {reminder === "afternoon" && <Link href="/dua-te-ha" className="btn small">Më ndihmo</Link>}
            <button className="btn small secondary" onClick={dismissReminder}>OK, e kuptova</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="stats">
          <div className="stat"><div className="v">{current.toFixed(1)}</div><div className="l">Pesha tani{latest === null ? " (fillestare)" : ""}</div></div>
          <div className="stat"><div className="v">{target.toFixed(0)}</div><div className="l">Objektivi</div></div>
          <div className="stat"><div className="v" style={{ color: "#86efac" }}>{remaining.toFixed(1)}</div><div className="l">kg mbeten</div></div>
        </div>
        <div className="mt"><ProgressBar value={progress} /></div>
        <div className="row between tiny muted mt">
          <span>{start.toFixed(1)} kg</span>
          <span>{Math.max(0, Math.round(progress * 100))}% e rrugës</span>
          <span>{target} kg</span>
        </div>
        <div className="stats mt">
          <div className="stat"><div className="v">{kcal}</div><div className="l">kcal sot / {profile.calorie_target}</div></div>
          <div className="stat"><div className="v" style={{ color: kcalLeft >= 0 ? "#fff" : "#fcd34d" }}>{kcalLeft >= 0 ? kcalLeft : 0}</div><div className="l">kcal mbeten</div></div>
          <div className="stat"><div className="v">{protein}</div><div className="l">g proteinë / {profile.protein_min}</div></div>
        </div>
      </div>

      <div className="big-grid">
        <Link href="/pesha" className="big-btn"><span className="ico">⚖️</span>SHTO PESHËN</Link>
        <Link href="/ushqimi" className="big-btn"><span className="ico">🍽️</span>ÇFARË HËNGRA?</Link>
        <Link href="/stervitja" className="big-btn"><span className="ico">🏋️</span>STËRVITJA U KRYE</Link>
        <Link href="/progresi" className="big-btn"><span className="ico">📈</span>PROGRESI IM</Link>
      </div>

      <Link href="/dua-te-ha" className="wide-btn craving">✋ DUA TË HA – MË NDIHMO</Link>
      <Link href="/coach" className="wide-btn coach">🤖 BLEDI AI COACH</Link>

      <div className="card">
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>Lista e sotme</h2>
          <span className={`badge ${pct === 100 ? "green" : ""}`}>{pct}%</span>
        </div>
        <ProgressBar value={pct / 100} green />
        <div className="mt">
          {items.map((i) => (
            <Check key={i.key} on={Boolean(cl?.[i.key])} label={i.label} onChange={(v) => toggle(i.key, v)} disabled={!cl} />
          ))}
        </div>
      </div>
    </div>
  );
}

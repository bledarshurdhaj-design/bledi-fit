"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/Providers";
import { ErrorBox, Loading, PageHeader, Toast, useToast } from "@/components/ui";
import LineChart from "@/components/LineChart";
import { sb, check } from "@/lib/dbClient";
import { dateStr, formatDateTime, todayStr } from "@/lib/dates";
import { round1, weightTrend } from "@/lib/stats";
import type { WeightEntry } from "@/lib/types";

export default function WeightPage() {
  const { profile } = useApp();
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = check(await sb().from("weights").select("id, kg, measured_at, note").order("measured_at", { ascending: false }).limit(500));
      const list = data.map((d) => ({ ...d, kg: Number(d.kg) })) as WeightEntry[];
      setEntries(list);
      setValue((v) => v || (list[0] ? list[0].kg.toFixed(1) : Number(profile.start_weight).toFixed(1)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [profile.start_weight]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const kg = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(kg) || kg < 30 || kg > 300) return setError("Shkruaj një peshë të vlefshme (30–300 kg).");
    setBusy(true);
    setError(null);
    try {
      check(await sb().from("weights").insert({ kg: round1(kg) }));
      showToast(`✓ U ruajt: ${round1(kg).toFixed(1)} kg`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Ta fshij këtë matje? (Vetëm nëse është gabim)")) return;
    try {
      check(await sb().from("weights").delete().eq("id", id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function step(d: number) {
    const n = parseFloat(value.replace(",", ".")) || 0;
    setValue(round1(n + d).toFixed(1));
  }

  const today = todayStr();
  const trend = entries ? weightTrend(entries, today) : null;
  const latest = entries?.[0]?.kg ?? null;
  const target = Number(profile.target_weight);
  const points = entries ? [...entries].reverse().slice(-60).map((e) => ({ x: dateStr(new Date(e.measured_at)), y: e.kg })) : [];

  return (
    <div className="page">
      <PageHeader title="⚖️ Pesha" />
      <ErrorBox error={error} />

      <div className="card">
        <label className="lbl center" htmlFor="kg">Pesha e sotme (kg)</label>
        <div className="row">
          <button className="btn secondary" style={{ minWidth: 60, fontSize: 26 }} onClick={() => step(-0.1)} aria-label="Minus 0.1">−</button>
          <input id="kg" className="input huge grow" inputMode="decimal" value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && save()} />
          <button className="btn secondary" style={{ minWidth: 60, fontSize: 26 }} onClick={() => step(0.1)} aria-label="Plus 0.1">+</button>
        </div>
        <button className="btn green block mt" style={{ minHeight: 64, fontSize: 20 }} onClick={save} disabled={busy}>
          {busy ? <span className="spinner" /> : "RUAJ PESHËN"}
        </button>
        <p className="tiny muted center mt">Data dhe ora ruhen automatikisht. Peshohu në mëngjes, pas tualetit, para ngrënies.</p>
      </div>

      {!entries ? <Loading /> : (
        <>
          <div className="card">
            <div className="stats">
              <div className="stat"><div className="v">{latest !== null ? latest.toFixed(1) : "–"}</div><div className="l">E fundit</div></div>
              <div className="stat"><div className="v" style={{ color: "#86efac" }}>{latest !== null ? Math.max(0, round1(latest - target)).toFixed(1) : "–"}</div><div className="l">kg deri në {target}</div></div>
              <div className="stat"><div className="v">{entries.length}</div><div className="l">Matje gjithsej</div></div>
            </div>
          </div>

          <div className="card">
            <h2>Krahasimi javor</h2>
            {trend && trend.avg_last7 !== null && trend.avg_prev7 !== null ? (
              <>
                <div className="row between"><span className="muted">Mesatarja 7 ditët e fundit</span><b>{trend.avg_last7.toFixed(1)} kg</b></div>
                <div className="row between mt"><span className="muted">Mesatarja java para</span><b>{trend.avg_prev7.toFixed(1)} kg</b></div>
                <div className="row between mt">
                  <span className="muted">Ndryshimi</span>
                  <b style={{ color: (trend.weekly_loss_kg ?? 0) > 0 ? "#86efac" : "#fff" }}>
                    {(trend.weekly_loss_kg ?? 0) > 0 ? "−" : "+"}{Math.abs(trend.weekly_loss_kg ?? 0).toFixed(1)} kg
                  </b>
                </div>
                <p className="tiny muted mt">Objektivi i qëndrueshëm: 0.5–0.9 kg në javë. Pesha ditore luhatet 0.5–1.5 kg nga uji dhe kripa – shiko trendin, jo një ditë.</p>
              </>
            ) : (
              <p className="muted small">Krahasimi shfaqet kur ke peshime në dy javë radhazi.</p>
            )}
          </div>

          <div className="card">
            <h2>Grafiku</h2>
            <LineChart points={points} target={target} />
          </div>

          <div className="card">
            <h2>Matjet e mëparshme</h2>
            {entries.length === 0 && <p className="muted">Ende asnjë matje.</p>}
            {(showAll ? entries : entries.slice(0, 10)).map((e) => (
              <div key={e.id} className="list-item">
                <div><b>{e.kg.toFixed(1)} kg</b><div className="tiny muted">{formatDateTime(e.measured_at)}</div></div>
                <button className="btn small ghost" onClick={() => remove(e.id)} aria-label="Fshi">🗑</button>
              </div>
            ))}
            {entries.length > 10 && !showAll && <button className="btn secondary block mt" onClick={() => setShowAll(true)}>Shfaq të gjitha ({entries.length})</button>}
          </div>
        </>
      )}
      <Toast msg={toast} />
    </div>
  );
}

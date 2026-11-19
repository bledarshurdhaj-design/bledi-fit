"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/Providers";
import { ErrorBox, Loading, PageHeader, ProgressBar, Toast, useToast } from "@/components/ui";
import { sb, check } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { todayStr } from "@/lib/dates";
import { round1 } from "@/lib/stats";
import type { Food, FoodLog } from "@/lib/types";

const EMOJI: Record<string, string> = {
  chicken_breast: "🍗", egg: "🥚", tuna: "🐟", fish_white: "🐠", greek_yogurt: "🥛", oats: "🥣",
  rice: "🍚", potato: "🥔", banana: "🍌", vegetables: "🥦", bread: "🍞",
};

interface EstItem { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; }

async function resizeImage(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Fotoja nuk u lexua."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function FoodPage() {
  const { profile, user } = useApp();
  const today = todayStr();
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [sel, setSel] = useState<Food | null>(null);
  const [grams, setGrams] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [panel, setPanel] = useState<"none" | "ai" | "custom">("none");

  // AI
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [est, setEst] = useState<{ items: EstItem[]; confidence: string; note: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Ushqim personal
  const [cf, setCf] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "100" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, l] = await Promise.all([
        sb().from("foods").select("*").order("id"),
        sb().from("food_logs").select("*").eq("log_date", today).order("eaten_at"),
      ]);
      setFoods(check(f) as Food[]);
      setLogs(check(l) as FoodLog[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const k = logs.reduce((a, l) => a + Number(l.kcal), 0);
    const p = logs.reduce((a, l) => a + Number(l.protein), 0);
    const est = logs.filter((l) => l.source === "ai_estimate").reduce((a, l) => a + Number(l.kcal), 0);
    return { kcal: Math.round(k), protein: Math.round(p), est: Math.round(est) };
  }, [logs]);

  const g = parseFloat(grams.replace(",", "."));
  const calc = sel && Number.isFinite(g) && g > 0
    ? { kcal: Math.round((sel.kcal * g) / 100), protein: round1((sel.protein * g) / 100), carbs: round1((sel.carbs * g) / 100), fat: round1((sel.fat * g) / 100) }
    : null;

  function pick(f: Food) {
    setSel(f);
    setGrams(String(f.portion_grams ?? 100));
  }

  async function add() {
    if (!sel || !calc) return setError("Zgjidh ushqimin dhe shkruaj gramët.");
    if (g > 3000) return setError("Sasia maksimale është 3000 g.");
    setBusy(true);
    setError(null);
    try {
      check(await sb().from("food_logs").insert({
        food_id: sel.id, name: sel.name, grams: round1(g), kcal: calc.kcal, protein: calc.protein, carbs: calc.carbs, fat: calc.fat,
        source: sel.user_id ? "custom" : "database", log_date: today,
      }));
      showToast(`✓ ${sel.name} – ${calc.kcal} kcal`);
      setSel(null);
      setGrams("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      check(await sb().from("food_logs").delete().eq("id", id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function estimate() {
    setAiError(null);
    setEst(null);
    if (!desc.trim() && !photo) return setAiError("Shkruaj çfarë hëngre ose shto një foto.");
    setAiBusy(true);
    try {
      const r = await api<{ items: EstItem[]; confidence: string; note: string }>("/api/coach/estimate", { description: desc, image: photo ?? undefined });
      setEst(r);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveEstimate() {
    if (!est?.items.length) return;
    setAiBusy(true);
    try {
      check(await sb().from("food_logs").insert(est.items.map((i) => ({
        name: i.name.slice(0, 120), grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat,
        source: "ai_estimate", log_date: today,
      }))));
      showToast("✓ U ruajt si vlerësim");
      setEst(null); setDesc(""); setPhoto(null); setPanel("none");
      await load();
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveCustom() {
    const n = (s: string) => parseFloat(s.replace(",", "."));
    const name = cf.name.trim();
    const v = { kcal: n(cf.kcal), protein: n(cf.protein || "0"), carbs: n(cf.carbs || "0"), fat: n(cf.fat || "0"), portion: parseInt(cf.portion || "100", 10) };
    if (!name || name.length > 80) return setError("Shkruaj emrin e ushqimit (deri 80 karaktere).");
    if (!(v.kcal >= 0 && v.kcal <= 950)) return setError("Kaloritë për 100 g duhet të jenë 0–950.");
    if ([v.protein, v.carbs, v.fat].some((x) => !(x >= 0 && x <= 100))) return setError("Makrot për 100 g duhet të jenë 0–100 g.");
    if (v.protein + v.carbs + v.fat > 100) return setError("Proteina + karbohidratet + yndyra s'mund të kalojnë 100 g për 100 g.");
    if (!(v.portion >= 1 && v.portion <= 2000)) return setError("Porcioni duhet të jetë 1–2000 g.");
    setBusy(true);
    try {
      check(await sb().from("foods").insert({
        user_id: user.id, name, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat,
        portion_grams: v.portion, portion_label: `${v.portion} g`, source: "custom",
      }));
      setCf({ name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "100" });
      setPanel("none");
      showToast("✓ Ushqimi u shtua në listë");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const left = profile.calorie_target - totals.kcal;
  const over = left < 0;

  return (
    <div className="page">
      <PageHeader title="🍽️ Çfarë hëngra?" />
      <ErrorBox error={error} />

      <div className="card center">
        <div className="muted small">{over ? "Mbi objektivin sot" : "Kalori të mbetura sot"}</div>
        <div className="big-number" style={{ color: over ? "#fcd34d" : "#fff" }}>{over ? `+${-left}` : left}</div>
        <div className="muted small mb">nga {profile.calorie_target} kcal · ngrënë {totals.kcal} kcal{totals.est ? ` (≈${totals.est} vlerësim AI)` : ""}</div>
        <ProgressBar value={totals.kcal / profile.calorie_target} />
        <div className="row between mt small">
          <span>Proteina: <b>{totals.protein} g</b> / {profile.protein_min}–{profile.protein_max} g</span>
          <span>{totals.protein >= profile.protein_min ? "✅" : `${profile.protein_min - totals.protein} g mbeten`}</span>
        </div>
        <div className="mt"><ProgressBar value={totals.protein / profile.protein_min} green /></div>
      </div>

      {over && (
        <div className="notice info">
          Asgjë e keqe – një ditë mbi objektiv nuk e prish progresin. <b>Vazhdo normalisht me vaktin e radhës.</b> Mos e kompenso me uri.
        </div>
      )}

      {!foods ? <Loading /> : (
        <div className="card">
          <h2>1. Zgjidh ushqimin</h2>
          <div className="food-grid">
            {foods.map((f) => (
              <button key={f.id} className={`food-btn ${sel?.id === f.id ? "on" : ""}`} onClick={() => pick(f)}>
                <span className="e">{(f.code && EMOJI[f.code]) || "⭐"}</span>
                <span>{f.name.split(" (")[0]}</span>
              </button>
            ))}
          </div>

          {sel && (
            <div className="mt">
              <h2>2. Sa gram?</h2>
              <div className="small muted mb">{sel.name} · {sel.kcal} kcal, {sel.protein} g proteinë për 100 g</div>
              <input className="input huge" inputMode="decimal" value={grams} autoFocus
                onChange={(e) => setGrams(e.target.value.replace(/[^0-9.,]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && add()} />
              <div className="chips mt">
                {sel.portion_grams && <button className="chip" onClick={() => setGrams(String(sel.portion_grams))}>{sel.portion_label}</button>}
                {sel.portion_grams && <button className="chip" onClick={() => setGrams(String(sel.portion_grams! * 2))}>×2</button>}
                {[50, 100, 150, 200].map((v) => <button key={v} className="chip" onClick={() => setGrams(String(v))}>{v} g</button>)}
              </div>
              {calc && (
                <div className="notice soft mt center">
                  <b style={{ fontSize: 22 }}>{calc.kcal} kcal</b> · {calc.protein} g proteinë
                  <div className="tiny muted">Karbohidrate {calc.carbs} g · Yndyrë {calc.fat} g</div>
                </div>
              )}
              <button className="btn green block" style={{ minHeight: 62, fontSize: 19 }} onClick={add} disabled={busy || !calc}>
                {busy ? <span className="spinner" /> : "SHTO"}
              </button>
            </div>
          )}
          <p className="tiny muted mt">Vlerat për 100 g: USDA FoodData Central. Matja me peshore është më e saktë.</p>
        </div>
      )}

      <div className="row mb">
        <button className={`btn grow ${panel === "ai" ? "" : "secondary"}`} onClick={() => setPanel(panel === "ai" ? "none" : "ai")}>📷 Foto / përshkrim (AI)</button>
        <button className={`btn grow ${panel === "custom" ? "" : "secondary"}`} onClick={() => setPanel(panel === "custom" ? "none" : "custom")}>➕ Ushqim i ri</button>
      </div>

      {panel === "ai" && (
        <div className="card">
          <h2>Vlerësim me AI</h2>
          <p className="small muted">Përshkruaj vaktin ose bëj foto. Rezultati është <b>vlerësim</b>, jo matje – kontrolloje para se ta ruash.</p>
          <textarea className="input" placeholder="p.sh. pjatë me oriz, gjoks pule dhe sallatë me vaj ulliri" value={desc} maxLength={600} onChange={(e) => setDesc(e.target.value)} />
          <label className="btn secondary block mt" style={{ cursor: "pointer" }}>
            {photo ? "📷 Fotoja u shtua – ndrysho" : "📷 Bëj / zgjidh foto"}
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { setPhoto(await resizeImage(f)); } catch (err) { setAiError((err as Error).message); }
            }} />
          </label>
          {photo && <img src={photo} alt="Foto e ushqimit" style={{ width: "100%", borderRadius: 14, marginTop: 10 }} />}
          <ErrorBox error={aiError} />
          <button className="btn block mt" onClick={estimate} disabled={aiBusy}>
            {aiBusy && !est ? <><span className="spinner" /> AI po analizon…</> : "VLERËSO"}
          </button>
          {est && (
            <div className="mt">
              <span className="badge est">VLERËSIM AI · besueshmëri {est.confidence}</span>
              {est.items.length === 0 && <p className="muted">Nuk u identifikua ushqim.</p>}
              {est.items.map((i, idx) => (
                <div key={idx} className="list-item">
                  <div className="grow"><b>{i.name}</b><div className="tiny muted">≈{i.grams} g</div></div>
                  <div className="small" style={{ textAlign: "right" }}>≈{Math.round(i.kcal)} kcal<div className="tiny muted">≈{i.protein} g P</div></div>
                  <button className="btn small ghost" aria-label="Hiq" onClick={() => setEst({ ...est, items: est.items.filter((_, j) => j !== idx) })}>✕</button>
                </div>
              ))}
              {est.note && <p className="tiny muted">{est.note}</p>}
              {est.items.length > 0 && (
                <>
                  <div className="notice soft center">Gjithsej ≈<b>{Math.round(est.items.reduce((a, i) => a + i.kcal, 0))} kcal</b> · ≈{Math.round(est.items.reduce((a, i) => a + i.protein, 0))} g proteinë</div>
                  <button className="btn green block" onClick={saveEstimate} disabled={aiBusy}>RUAJ SI VLERËSIM</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {panel === "custom" && (
        <div className="card">
          <h2>Shto ushqim tëndin</h2>
          <p className="small muted">Vlerat për 100 g (i gjen në etiketën e produktit).</p>
          <label className="lbl">Emri</label>
          <input className="input" value={cf.name} maxLength={80} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
          <div className="row">
            <div className="grow"><label className="lbl">kcal / 100 g</label><input className="input" inputMode="decimal" value={cf.kcal} onChange={(e) => setCf({ ...cf, kcal: e.target.value })} /></div>
            <div className="grow"><label className="lbl">Proteina g</label><input className="input" inputMode="decimal" value={cf.protein} onChange={(e) => setCf({ ...cf, protein: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="grow"><label className="lbl">Karbo g</label><input className="input" inputMode="decimal" value={cf.carbs} onChange={(e) => setCf({ ...cf, carbs: e.target.value })} /></div>
            <div className="grow"><label className="lbl">Yndyrë g</label><input className="input" inputMode="decimal" value={cf.fat} onChange={(e) => setCf({ ...cf, fat: e.target.value })} /></div>
            <div className="grow"><label className="lbl">Porcion g</label><input className="input" inputMode="numeric" value={cf.portion} onChange={(e) => setCf({ ...cf, portion: e.target.value })} /></div>
          </div>
          <button className="btn green block mt" onClick={saveCustom} disabled={busy}>RUAJ USHQIMIN</button>
        </div>
      )}

      <div className="card">
        <h2>Sot ({logs.length})</h2>
        {logs.length === 0 && <p className="muted">Ende asnjë ushqim sot.</p>}
        {logs.map((l) => (
          <div key={l.id} className="list-item">
            <div className="grow">
              <b>{l.name}</b> {l.source === "ai_estimate" && <span className="badge est">≈ vlerësim</span>}
              <div className="tiny muted">{Number(l.grams)} g · {new Date(l.eaten_at).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
            </div>
            <div className="small" style={{ textAlign: "right" }}>{Math.round(Number(l.kcal))} kcal<div className="tiny muted">{Math.round(Number(l.protein))} g P</div></div>
            <button className="btn small ghost" aria-label="Fshi" onClick={() => remove(l.id)}>🗑</button>
          </div>
        ))}
      </div>
      <Toast msg={toast} />
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { logout, useApp } from "@/components/Providers";
import { Check, ErrorBox, PageHeader, Toast, useToast } from "@/components/ui";
import { sb, check } from "@/lib/dbClient";
import { api } from "@/lib/api";
import { disablePush, enablePush, getPushState, isIOS, type PushState } from "@/lib/push";
import { REMINDERS, type Slot } from "@/lib/messages";
import type { Profile } from "@/lib/types";

type Form = Record<string, string>;

const FIELDS: { key: keyof Profile; label: string; min?: number; max?: number; decimal?: boolean; text?: boolean }[] = [
  { key: "display_name", label: "Emri", text: true },
  { key: "start_weight", label: "Pesha fillestare (kg)", min: 30, max: 300, decimal: true },
  { key: "target_weight", label: "Pesha objektiv (kg)", min: 30, max: 300, decimal: true },
  { key: "height_cm", label: "Gjatësia (cm)", min: 120, max: 230 },
  { key: "age", label: "Mosha", min: 14, max: 100 },
  { key: "training_days", label: "Stërvitje në javë", min: 0, max: 7 },
  { key: "cardio_minutes", label: "Kardio në mëngjes (min)", min: 0, max: 120 },
  { key: "calorie_target", label: "Kalori ditore (kcal)", min: 1500, max: 4500 },
  { key: "protein_min", label: "Proteina min (g)", min: 60, max: 300 },
  { key: "protein_max", label: "Proteina max (g)", min: 60, max: 320 },
  { key: "training_time", label: "Ora e stërvitjes", text: true },
  { key: "food_preferences", label: "Ushqimet e preferuara", text: true },
  { key: "timezone", label: "Zona kohore", text: true },
];

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "Ky shfletues nuk i mbështet njoftimet push. Kujtuesit do të shfaqen brenda aplikacionit.",
  "ios-needs-install": "Në iPhone, njoftimet funksionojnë vetëm pasi aplikacioni shtohet në Home Screen (Safari → Share → Add to Home Screen) dhe hapet prej andej. Kërkohet iOS 16.4 ose më i ri.",
  "not-configured": "Push nuk është konfiguruar ende në server (mungojnë VAPID keys). Kujtuesit shfaqen vetëm brenda aplikacionit.",
  denied: "Njoftimet janë bllokuar. Lejoji te Cilësimet e telefonit → BLEDI FIT → Notifications.",
  off: "Njoftimet push janë joaktive në këtë pajisje.",
  on: "✓ Njoftimet push janë aktive në këtë pajisje.",
};

export default function SettingsPage() {
  const { profile, user, reloadProfile } = useApp();
  const [form, setForm] = useState<Form>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(profile[f.key] ?? "")])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => { getPushState().then(setPush); }, []);

  async function saveProfile() {
    setError(null);
    const patch: Record<string, string | number> = {};
    for (const f of FIELDS) {
      const raw = (form[f.key] ?? "").trim();
      if (f.text) {
        if (!raw || raw.length > 200) return setError(`${f.label}: plotëso fushën (deri 200 karaktere).`);
        patch[f.key] = raw;
        continue;
      }
      const n = f.decimal ? parseFloat(raw.replace(",", ".")) : parseInt(raw, 10);
      if (!Number.isFinite(n) || n < f.min! || n > f.max!) return setError(`${f.label}: duhet të jetë ${f.min}–${f.max}.`);
      patch[f.key] = f.decimal ? Math.round(n * 100) / 100 : n;
    }
    if (Number(patch.protein_max) < Number(patch.protein_min)) return setError("Proteina max duhet të jetë ≥ proteina min.");
    try { new Intl.DateTimeFormat("en", { timeZone: String(patch.timezone) }); } catch { return setError("Zona kohore e pavlefshme (p.sh. Europe/Belgrade)."); }
    setBusy(true);
    try {
      check(await sb().from("profiles").update(patch).eq("user_id", user.id));
      await reloadProfile();
      showToast("✓ Cilësimet u ruajtën");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(slot: Slot, v: boolean) {
    const key = REMINDERS[slot].prefKey;
    const { error } = await sb().from("profiles").update({ [key]: v }).eq("user_id", user.id);
    if (error) return setError(error.message);
    await reloadProfile();
  }

  async function onPush(enable: boolean) {
    setPushBusy(true);
    setError(null);
    try {
      if (enable) await enablePush(); else await disablePush();
      setPush(await getPushState());
      showToast(enable ? "✓ Njoftimet u aktivizuan" : "Njoftimet u çaktivizuan");
    } catch (e) {
      setError((e as Error).message);
      setPush(await getPushState());
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush(slot?: Slot) {
    setPushBusy(true);
    setError(null);
    try {
      await api("/api/push/test", { slot });
      showToast("✓ U dërgua – kontrollo njoftimin");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const tables = ["profiles", "weights", "food_logs", "foods", "workout_sessions", "cardio_sessions", "daily_checklist",
        "daily_checkins", "craving_events", "ai_messages", "ai_reports", "plan_proposals"];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), email: user.email };
      for (const t of tables) {
        let q = sb().from(t).select("*");
        if (t === "foods") q = q.eq("user_id", user.id);
        out[t] = check(await q.limit(10000));
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bledi-fit-eksport-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="⚙️ Cilësimet" />
      <ErrorBox error={error} />

      <div className="card">
        <h2>🔔 Kujtuesit ditorë</h2>
        {push && <div className={`notice ${push === "on" ? "ok" : "soft"}`}>{PUSH_TEXT[push]}</div>}
        {push === "off" && <button className="btn block" onClick={() => onPush(true)} disabled={pushBusy}>{pushBusy ? <span className="spinner" /> : "AKTIVIZO NJOFTIMET"}</button>}
        {push === "on" && (
          <div className="row">
            <button className="btn grow" onClick={() => testPush()} disabled={pushBusy}>Dërgo provë</button>
            <button className="btn danger grow" onClick={() => onPush(false)} disabled={pushBusy}>Çaktivizo</button>
          </div>
        )}
        <div className="mt">
          {(Object.keys(REMINDERS) as Slot[]).map((s) => (
            <div key={s}>
              <Check on={Boolean(profile[REMINDERS[s].prefKey as keyof Profile])} onChange={(v) => togglePref(s, v)}
                label={<><b>{REMINDERS[s].title}</b><div className="tiny muted">{REMINDERS[s].body}</div></>} />
              {push === "on" && <button className="btn small ghost mb" onClick={() => testPush(s)} disabled={pushBusy}>Provo këtë kujtues</button>}
            </div>
          ))}
        </div>
        <p className="tiny muted">Kujtuesit dërgohen në 08:00, 15:00 dhe 19:00 sipas zonës kohore. Kur push s'është aktiv, i sheh në faqen kryesore.{isIOS() ? " iPhone: njoftimet duhen lejuar edhe te Settings → Notifications." : ""}</p>
      </div>

      <div className="card">
        <h2>👤 Profili dhe objektivat</h2>
        <p className="tiny muted">2,300 kcal dhe 180–190 g proteinë janë vlerësime fillestare – rregullohen sipas progresit real.</p>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="lbl">{f.label}</label>
            <input className="input" inputMode={f.text ? "text" : f.decimal ? "decimal" : "numeric"} value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </div>
        ))}
        <button className="btn green block mt" onClick={saveProfile} disabled={busy}>RUAJ</button>
      </div>

      <div className="card">
        <h2>🔒 Të dhënat e mia</h2>
        <p className="small muted">{user.email}</p>
        <button className="btn secondary block" onClick={exportData} disabled={busy}>⬇️ Eksporto të gjitha të dhënat (JSON)</button>
        <button className="btn danger block mt" onClick={logout}>Dil nga llogaria</button>
      </div>
      <Toast msg={toast} />
    </div>
  );
}

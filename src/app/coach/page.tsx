"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/Providers";
import { ErrorBox, Loading, PageHeader, Toast, useToast } from "@/components/ui";
import { sb, check } from "@/lib/dbClient";
import { api } from "@/lib/api";
import { daysBetween, formatDateTime, todayStr } from "@/lib/dates";
import { FIELD_LABELS, type PlanProposal } from "@/lib/types";

type Tab = "chat" | "checkin" | "weekly";
interface Msg { role: "user" | "assistant"; content: string; }
interface Report { content: string; period_start: string; created_at: string; }

const QUICK = [
  "Çfarë të ha për darkë sot?",
  "Si po shkoj këtë javë?",
  "Kam uri pas stërvitjes, çfarë të bëj?",
  "Sa proteinë më mbetet sot?",
];

const MAX_INPUT = 2000;

export default function CoachPage() {
  const { online, reloadProfile } = useApp();
  const [tab, setTab] = useState<Tab>("chat");
  const [proposals, setProposals] = useState<PlanProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  // Chat
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Check-in
  const [hunger, setHunger] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [daily, setDaily] = useState<Report | null>(null);
  const [ciBusy, setCiBusy] = useState(false);

  // Javore
  const [weekly, setWeekly] = useState<Report | null | undefined>(undefined);
  const [wkBusy, setWkBusy] = useState(false);
  const autoTried = useRef(false);

  const today = todayStr();

  const loadProposals = useCallback(async () => {
    const { data } = await sb().from("plan_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false });
    setProposals((data ?? []) as PlanProposal[]);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, d, w] = await Promise.all([
        sb().from("ai_messages").select("role, content").eq("mode", "chat").order("created_at", { ascending: false }).limit(40),
        sb().from("ai_reports").select("content, period_start, created_at").eq("kind", "daily").eq("period_start", today).maybeSingle(),
        sb().from("ai_reports").select("content, period_start, created_at").eq("kind", "weekly").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setMsgs((check(m) as Msg[]).reverse());
      setDaily(check(d) as Report | null);
      setWeekly(check(w) as Report | null);
      await loadProposals();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today, loadProposals]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, sending]);

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    if (t.length > MAX_INPUT) return setError(`Mesazhi është shumë i gjatë (maksimumi ${MAX_INPUT} karaktere).`);
    setError(null);
    setLastFailed(null);
    setInput("");
    setMsgs((m) => [...(m ?? []), { role: "user", content: t }]);
    setSending(true);
    try {
      const r = await api<{ reply: string; proposals: unknown[] }>("/api/coach", { mode: "chat", message: t });
      setMsgs((m) => [...(m ?? []), { role: "assistant", content: r.reply }]);
      if (r.proposals?.length) await loadProposals();
    } catch (e) {
      setMsgs((m) => (m ?? []).slice(0, -1));
      setLastFailed(t);
      setInput(t);
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function doCheckin() {
    if (hunger === null || energy === null) return setError("Zgjidh urinë dhe energjinë.");
    setCiBusy(true);
    setError(null);
    try {
      const r = await api<{ reply: string }>("/api/coach", { mode: "checkin", hunger, energy, note });
      setDaily({ content: r.reply, period_start: today, created_at: new Date().toISOString() });
      await loadProposals();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCiBusy(false);
    }
  }

  const runWeekly = useCallback(async () => {
    setWkBusy(true);
    setError(null);
    try {
      const r = await api<{ reply: string }>("/api/coach", { mode: "weekly" });
      setWeekly({ content: r.reply, period_start: today, created_at: new Date().toISOString() });
      await loadProposals();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWkBusy(false);
    }
  }, [today, loadProposals]);

  // Analiza javore gjenerohet automatikisht çdo 7 ditë kur hapet skeda
  useEffect(() => {
    if (tab !== "weekly" || weekly === undefined || autoTried.current || !online) return;
    const stale = !weekly || daysBetween(weekly.created_at.slice(0, 10), today) >= 7;
    if (stale) {
      autoTried.current = true;
      runWeekly();
    }
  }, [tab, weekly, today, online, runWeekly]);

  async function decide(p: PlanProposal, action: "accept" | "reject") {
    if (action === "accept" && !confirm(`Ta ndryshoj "${FIELD_LABELS[p.field]}" nga ${p.old_value} në ${p.new_value}?`)) return;
    try {
      await api("/api/coach/proposal", { id: p.id, action });
      if (action === "accept") {
        await reloadProfile();
        showToast("✓ Plani u përditësua");
      }
      await loadProposals();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader title="🤖 AI Coach" />

      {!online && <div className="notice warn">Je offline. AI Coach kërkon internet – mund të lexosh bisedat e ruajtura.</div>}

      {proposals.map((p) => (
        <div key={p.id} className="notice info">
          <b>Propozim për planin</b>
          <div className="mt">{FIELD_LABELS[p.field]}: <b>{p.old_value} → {p.new_value}</b></div>
          <div className="small mt">{p.reason}</div>
          <div className="tiny muted mt">Asgjë nuk ndryshon pa miratimin tënd.</div>
          <div className="row mt">
            <button className="btn small green grow" onClick={() => decide(p, "accept")}>Prano</button>
            <button className="btn small secondary grow" onClick={() => decide(p, "reject")}>Refuzo</button>
          </div>
        </div>
      ))}

      <div className="tabs">
        <button className={`tab ${tab === "chat" ? "on" : ""}`} onClick={() => setTab("chat")}>Bisedë</button>
        <button className={`tab ${tab === "checkin" ? "on" : ""}`} onClick={() => setTab("checkin")}>Check-in</button>
        <button className={`tab ${tab === "weekly" ? "on" : ""}`} onClick={() => setTab("weekly")}>Javore</button>
      </div>

      <ErrorBox error={error} onRetry={lastFailed ? () => send(lastFailed) : undefined} />

      {tab === "chat" && (
        <>
          {msgs === null ? <Loading /> : (
            <div className="chat">
              {msgs.length === 0 && (
                <div className="notice soft">
                  Përshëndetje! Unë jam BLEDI AI COACH. Shoh peshën, ushqimin, stërvitjet dhe listën tënde ditore – dhe të ndihmoj me këshilla praktike. Vlerat me “≈” janë vlerësime, jo matje.
                </div>
              )}
              {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
              {sending && <div className="msg assistant"><span className="spinner" /> duke menduar…</div>}
              <div ref={endRef} />
            </div>
          )}
          <div className="composer">
            {msgs && msgs.length < 2 && (
              <div className="chips mb">
                {QUICK.map((q) => <button key={q} className="chip" onClick={() => send(q)} disabled={sending || !online}>{q}</button>)}
              </div>
            )}
            <div className="row">
              <input className="input grow" placeholder="Shkruaj pyetjen…" value={input} maxLength={MAX_INPUT}
                onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={!online} />
              <button className="btn" onClick={() => send()} disabled={sending || !input.trim() || !online} aria-label="Dërgo">➤</button>
            </div>
          </div>
        </>
      )}

      {tab === "checkin" && (
        <div className="card">
          <h2>Check-in i sotëm</h2>
          <p className="small muted">AI shikon ushqimin, stërvitjen, kardion dhe trendin e peshës nga të dhënat e tua. Ti trego vetëm si ndihesh.</p>
          <label className="lbl">Uria sot (1 = shumë pak, 5 = shumë)</label>
          <div className="scale">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={hunger === n ? "on" : ""} onClick={() => setHunger(n)}>{n}</button>)}</div>
          <label className="lbl">Energjia sot (1 = shumë e ulët, 5 = shumë e lartë)</label>
          <div className="scale">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={energy === n ? "on" : ""} onClick={() => setEnergy(n)}>{n}</button>)}</div>
          <label className="lbl">Shënim (opsional)</label>
          <textarea className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="p.sh. kam fjetur pak, pata stres në punë" />
          <button className="btn block mt" onClick={doCheckin} disabled={ciBusy || !online}>
            {ciBusy ? <><span className="spinner" /> AI po analizon…</> : daily ? "BËJ CHECK-IN PËRSËRI" : "BËJ CHECK-IN"}
          </button>
          {daily && (
            <div className="mt">
              <div className="tiny muted mb">{formatDateTime(daily.created_at)}</div>
              <div className="msg assistant" style={{ maxWidth: "100%" }}>{daily.content}</div>
            </div>
          )}
        </div>
      )}

      {tab === "weekly" && (
        <div className="card">
          <h2>Analiza javore</h2>
          {weekly === undefined || (wkBusy && !weekly) ? <Loading text="AI po analizon javën…" /> : weekly ? (
            <>
              <div className="tiny muted mb">Gjeneruar: {formatDateTime(weekly.created_at)}</div>
              <div className="msg assistant" style={{ maxWidth: "100%" }}>{weekly.content}</div>
            </>
          ) : <p className="muted">Ende pa analizë javore.</p>}
          <button className="btn secondary block mt" onClick={runWeekly} disabled={wkBusy || !online}>
            {wkBusy ? <><span className="spinner" /> Duke analizuar…</> : "🔄 Rifresko analizën"}
          </button>
          <p className="tiny muted mt">Analiza bazohet në mesataret javore, jo në një peshim të vetëm. Gjenerohet automatikisht çdo 7 ditë.</p>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}

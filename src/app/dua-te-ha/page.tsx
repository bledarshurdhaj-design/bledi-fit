"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/Providers";
import { Check, ErrorBox, PageHeader } from "@/components/ui";
import { sb } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { todayStr } from "@/lib/dates";
import { MOTIVATION } from "@/lib/messages";

type Kind = "hungry" | "craving" | "already_ate";

// Vlerat e llogaritura nga tabela USDA e aplikacionit
const SNACKS = [
  { text: "Jogurt grek 170 g + 1 banane", kcal: 231, protein: 18 },
  { text: "2 vezë + 1 fetë bukë", kcal: 223, protein: 15 },
  { text: "Ton 120 g + perime 150 g", kcal: 237, protein: 35 },
  { text: "Jogurt grek 170 g", kcal: 124, protein: 17 },
  { text: "Perime 150 g + 1 vezë", kcal: 169, protein: 11 },
  { text: "Gjoks pule 150 g + patate 200 g + perime", kcal: 519, protein: 55 },
];

export default function CravingPage() {
  const { profile, user, online } = useApp();
  const [seconds, setSeconds] = useState(120);
  const [running, setRunning] = useState(false);
  const [water, setWater] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mi, setMi] = useState(0);

  useEffect(() => {
    if (!running) return;
    if (seconds <= 0) { setRunning(false); return; }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, seconds]);

  useEffect(() => {
    const t = setInterval(() => setMi((i) => (i + 1) % MOTIVATION.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    sb().from("food_logs").select("kcal").eq("log_date", todayStr()).then(({ data }) => {
      if (data) setLeft(profile.calorie_target - Math.round(data.reduce((a, l) => a + Number(l.kcal), 0)));
    });
  }, [profile.calorie_target]);

  async function choose(k: Kind) {
    setKind(k);
    setAi(null);
    // Ruhet për të zbuluar modelet (ora, dita) – pa gjykim
    await sb().from("craving_events").insert({ user_id: user.id, kind: k });
  }

  async function askAI() {
    if (!kind) return;
    setAiBusy(true);
    setError(null);
    try {
      const r = await api<{ reply: string }>("/api/coach", { mode: "craving", kind });
      setAi(r.reply);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  const fitting = SNACKS.filter((s) => left === null || s.kcal <= Math.max(left, 130)).slice(0, 3);
  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="page">
      <PageHeader title="MOS U DORËZO" />
      <p className="center muted small" style={{ marginTop: -6 }}>NEVER QUIT – VAZHDO TANI</p>

      <div className="motivation">“{MOTIVATION[mi]}”</div>

      <div className="card">
        <h2>1. Ndalu për 2 minuta</h2>
        <div className="timer">{mm}:{ss}</div>
        {seconds > 0 ? (
          <button className="btn block" onClick={() => setRunning(!running)}>{running ? "Pauzë" : seconds === 120 ? "▶ FILLO 2 MINUTA" : "▶ Vazhdo"}</button>
        ) : (
          <div className="notice ok center">✓ 2 minutat kaluan. Si ndihesh tani?</div>
        )}
      </div>

      <div className="card">
        <h2>2. Pi një gotë ujë</h2>
        <Check on={water} onChange={setWater} label="💧 E piva një gotë ujë" />
      </div>

      <div className="card">
        <h2>3. A ke uri fizike apo vetëm dëshirë?</h2>
        <p className="small muted">Uria fizike vjen ngadalë dhe çdo ushqim të duket mirë. Dëshira vjen papritur dhe kërkon diçka specifike (ëmbëlsirë, fast food).</p>
        <div style={{ display: "grid", gap: 8 }}>
          <button className={`btn ${kind === "hungry" ? "" : "secondary"}`} onClick={() => choose("hungry")}>🍽️ Kam uri fizike</button>
          <button className={`btn ${kind === "craving" ? "" : "secondary"}`} onClick={() => choose("craving")}>🍫 Është vetëm dëshirë</button>
          <button className={`btn ${kind === "already_ate" ? "" : "secondary"}`} onClick={() => choose("already_ate")}>😕 Kam ngrënë tashmë jashtë planit</button>
        </div>
      </div>

      {kind === "hungry" && (
        <div className="card">
          <h2>4. Zgjidh një vakt ose snack të arsyeshëm</h2>
          {left !== null && <p className="small muted">Të mbeten sot: <b>{Math.max(0, left)} kcal</b></p>}
          {fitting.map((s) => (
            <div key={s.text} className="list-item">
              <span>{s.text}</span>
              <span className="small muted" style={{ whiteSpace: "nowrap" }}>{s.kcal} kcal · {s.protein} g P</span>
            </div>
          ))}
          <Link href="/ushqimi" className="btn green block mt">Regjistro vaktin</Link>
        </div>
      )}

      {kind === "craving" && (
        <div className="card">
          <h2>4. Dëshira kalon – zakonisht për 10–20 minuta</h2>
          <ul className="steps">
            <li>Largohu nga kuzhina dhe bëj diçka tjetër për 10 minuta (ec, telefono dikë, lahu).</li>
            <li>Nëse e do patjetër diçka të ëmbël: jogurt grek me pak banane – 1 porcion, ulur, ngadalë.</li>
            <li>Ha vaktin e radhës në kohë – uria e madhe e bën dëshirën më të fortë.</li>
          </ul>
        </div>
      )}

      {kind === "already_ate" && (
        <div className="card">
          <h2>4. Vazhdo normalisht me vaktin e radhës</h2>
          <ul className="steps">
            <li>Mos e shtyj dietën për nesër. Plani vazhdon që nga vakti i ardhshëm.</li>
            <li>Mos e kompenso me uri apo me stërvitje ekstra – vetëm kthehu te plani.</li>
            <li>Regjistroje me ndershmëri. Të dhënat e vërteta të ndihmojnë të shohësh modelin.</li>
          </ul>
          <Link href="/ushqimi" className="btn secondary block mt">Regjistro atë që hëngra</Link>
        </div>
      )}

      {kind && (
        <div className="card">
          <h2>🤖 Këshillë personale nga AI Coach</h2>
          <ErrorBox error={error} onRetry={askAI} />
          {ai ? (
            <div className="msg assistant" style={{ maxWidth: "100%" }}>{ai}</div>
          ) : (
            <button className="btn block" onClick={askAI} disabled={aiBusy || !online}>
              {aiBusy ? <><span className="spinner" /> AI po mendon…</> : online ? "MË NDIHMO TANI" : "AI kërkon internet"}
            </button>
          )}
        </div>
      )}

      <div className="card">
        {MOTIVATION.map((m) => <p key={m} style={{ margin: "8px 0" }}>✔️ {m}</p>)}
      </div>
    </div>
  );
}

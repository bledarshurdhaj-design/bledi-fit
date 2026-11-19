"use client";
import { useState } from "react";
import { sb } from "@/lib/supabaseClient";

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "Email ose fjalëkalim i gabuar.";
  if (/Email not confirmed/i.test(msg)) return "Konfirmo email-in (kontrollo inbox-in) dhe provo përsëri.";
  if (/already registered/i.test(msg)) return "Ky email është i regjistruar. Hyr me fjalëkalimin.";
  if (/Password should be/i.test(msg)) return "Fjalëkalimi duhet të ketë të paktën 8 karaktere.";
  return msg;
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Shkruaj një email të vlefshëm.");
    if (password.length < 8) return setError("Fjalëkalimi duhet të ketë të paktën 8 karaktere.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await sb().auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo("Llogaria u krijua. Hap email-in dhe kliko lidhjen e konfirmimit, pastaj hyr.");
      }
    } catch (err) {
      setError(translate((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 48px)" }}>
      <div className="center mb">
        <img src="/icons/icon-192.png" alt="" width={96} height={96} style={{ borderRadius: 22 }} />
        <div className="brand mt">BLEDI <span>FIT</span></div>
        <p className="muted">Humb dhjamin. Ruaj muskujt. Vazhdo TANI.</p>
      </div>
      <form className="card" onSubmit={submit}>
        <h2>{mode === "login" ? "Hyr" : "Krijo llogari"}</h2>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lbl" htmlFor="pw">Fjalëkalimi</label>
        <input id="pw" className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="notice warn mt">{error}</div>}
        {info && <div className="notice ok mt">{info}</div>}
        <button className="btn block mt" disabled={busy}>
          {busy ? <span className="spinner" /> : mode === "login" ? "HYR" : "KRIJO LLOGARINË"}
        </button>
        <button type="button" className="btn ghost block mt" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>
          {mode === "login" ? "Nuk ke llogari? Regjistrohu" : "Ke llogari? Hyr"}
        </button>
      </form>
    </div>
  );
}

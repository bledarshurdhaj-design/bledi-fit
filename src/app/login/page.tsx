"use client";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nëse nuk ka asnjë llogari ende, hap direkt "Krijo llogari"
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) location.href = "/";
        else if (j?.firstUser) setMode("signup");
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Shkruaj një email të vlefshëm.");
    if (password.length < 8) return setError("Fjalëkalimi duhet të ketë të paktën 8 karaktere.");
    if (!navigator.onLine) return setError("Je offline. Lidhu me internet.");
    setBusy(true);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Gabim (${res.status}).`);
      location.href = "/";
    } catch (err) {
      setError((err as Error).message);
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
        <h2>{mode === "login" ? "Hyr" : "Krijo llogarinë"}</h2>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lbl" htmlFor="pw">Fjalëkalimi</label>
        <input id="pw" className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="notice warn mt">{error}</div>}
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

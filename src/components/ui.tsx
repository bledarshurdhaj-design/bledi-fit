"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function PageHeader({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <div className="topbar">
      <Link href={back} className="icon-btn" aria-label="Kthehu">‹</Link>
      <h1 className="grow center">{title}</h1>
      <span style={{ width: 46 }} />
    </div>
  );
}

export function Check({ on, label, onChange, disabled }: { on: boolean; label: React.ReactNode; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      className={`check ${on ? "on" : ""}`}
      style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!on)}
    >
      <span className="box">{on ? "✓" : ""}</span>
      <span className="grow">{label}</span>
    </div>
  );
}

export function ProgressBar({ value, green }: { value: number; green?: boolean }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return <div className={`bar ${green ? "green" : ""}`}><div style={{ width: `${pct}%` }} /></div>;
}

export function ErrorBox({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="notice warn">
      {error}
      {onRetry && <div className="mt"><button className="btn small secondary" onClick={onRetry}>Provo përsëri</button></div>}
    </div>
  );
}

type ToastMsg = { text: string; id: number } | null;

export function Toast({ msg }: { msg: ToastMsg }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!show || !msg) return null;
  const text = msg.text;
  return (
    <div style={{
      position: "fixed", left: "50%", bottom: "calc(env(safe-area-inset-bottom,0px) + 24px)", transform: "translateX(-50%)",
      background: "#16a34a", color: "#fff", padding: "14px 20px", borderRadius: 16, fontWeight: 800, zIndex: 100,
      boxShadow: "0 8px 30px rgba(0,0,0,.4)", maxWidth: "90vw", textAlign: "center",
    }}>{text}</div>
  );
}

export function useToast(): [ToastMsg, (t: string) => void] {
  const [t, setT] = useState<ToastMsg>(null);
  return [t, (text: string) => setT({ text, id: Date.now() })];
}

export function Loading({ text = "Duke ngarkuar…" }: { text?: string }) {
  return <div className="row" style={{ justifyContent: "center", padding: 20 }}><span className="spinner" /><span className="muted">{text}</span></div>;
}

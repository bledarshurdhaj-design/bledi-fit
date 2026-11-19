"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

export interface User {
  id: string;
  email: string;
}

interface AppCtx {
  user: User;
  profile: Profile;
  reloadProfile: () => Promise<void>;
  online: boolean;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp jashtë Providers");
  return c;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  location.href = "/login";
}

const PUBLIC = ["/login"];

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const online = useOnline();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) {
        setUser(null);
        setProfile(null);
      } else if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Gabim në server (${res.status}).`);
      } else {
        const j = (await res.json()) as { user: User; profile: Profile };
        setUser(j.user);
        setProfile(j.profile);
      }
      setError(null);
    } catch (e) {
      setError(!navigator.onLine ? "Je offline. Lidhu me internet për të hapur aplikacionin." : (e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isPublic = PUBLIC.includes(path);

  useEffect(() => {
    if (ready && !error && !user && !isPublic) router.replace("/login");
    if (ready && user && path === "/login") router.replace("/");
  }, [ready, user, isPublic, path, router, error]);

  const bar = !online ? <div className="offline-bar">Je offline – të dhënat e reja nuk mund të ruhen tani.</div> : null;

  if (error && !isPublic) {
    return (
      <div className="page">
        <div className="notice warn">{error}</div>
        <button className="btn block" onClick={() => { setReady(false); load(); }}>Provo përsëri</button>
      </div>
    );
  }

  if (isPublic) return <>{bar}{children}</>;

  if (!ready || !user || !profile) {
    return (
      <div className="loading-screen">
        <div className="brand">BLEDI <span>FIT</span></div>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ user, profile, reloadProfile: load, online }}>
      {bar}
      {children}
    </Ctx.Provider>
  );
}

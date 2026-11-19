"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { sb, supabaseConfigured } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/types";

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

const PUBLIC = ["/login"];

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const online = useOnline();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service Worker (offline + push)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await sb().from("profiles").select("*").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    if (data) {
      setProfile(data as Profile);
      return;
    }
    // Profili krijohet nga trigger-i; rezervë nëse trigger-i nuk ekzistonte
    const ins = await sb().from("profiles").insert({ user_id: uid }).select("*").single();
    if (ins.error) throw ins.error;
    setProfile(ins.data as Profile);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured()) {
      setError("Supabase nuk është konfiguruar. Vendos NEXT_PUBLIC_SUPABASE_URL dhe NEXT_PUBLIC_SUPABASE_ANON_KEY (shih README).");
      setReady(true);
      return;
    }
    let active = true;
    sb().auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        try { await loadProfile(u.id); } catch (e) { setError((e as Error).message); }
      }
      setReady(true);
    });
    const { data: sub } = sb().auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      // setTimeout: shmang bllokimin e njohur kur thirret Supabase brenda këtij callback-u
      if (u) setTimeout(() => loadProfile(u.id).catch((e) => setError((e as Error).message)), 0);
      else setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const isPublic = PUBLIC.includes(path);

  useEffect(() => {
    if (ready && !user && !isPublic && !error) router.replace("/login");
    if (ready && user && path === "/login") router.replace("/");
  }, [ready, user, isPublic, path, router, error]);

  const bar = !online ? <div className="offline-bar">Je offline – të dhënat e reja nuk mund të ruhen tani.</div> : null;

  if (error) {
    return (
      <div className="page">
        <div className="notice warn">{error}</div>
        <button className="btn block" onClick={() => location.reload()}>Provo përsëri</button>
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
    <Ctx.Provider value={{ user, profile, reloadProfile: () => loadProfile(user.id), online }}>
      {bar}
      {children}
    </Ctx.Provider>
  );
}

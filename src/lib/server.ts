import "server-only";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(503, `Serveri nuk është konfiguruar: mungon ${name}.`);
  return v;
}

/** Verifikon token-in e përdoruesit dhe kthen një klient Supabase ku vlen RLS. */
export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Nuk je i identifikuar.");
  const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sesioni ka skaduar. Hyr përsëri.");
  return { user: data.user, db };
}

/** Klient me service role – VETËM për cron/push në server. */
export function adminClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readJson<T>(req: Request, maxBytes = 2_500_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Kërkesa është shumë e madhe.");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, "JSON i pavlefshëm.");
  }
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Ndodhi një gabim i papritur në server." }, 500);
    }
  };
}

export function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

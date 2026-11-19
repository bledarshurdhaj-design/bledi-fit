import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { sql, userDb } from "./db";
import { HttpError } from "./errors";
import type { Db } from "./qb";

export { HttpError };

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "bf_session";
const SESSION_DAYS = 60;

export interface AuthUser {
  id: string;
  email: string;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// ---------- Fjalëkalimet ----------
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const expected = Buffer.from(h, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ---------- Sesionet (cookie HttpOnly) ----------
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha(token), userId]);
  await sql(`delete from sessions where user_id = $1 and expires_at < now()`, [userId]);
  return token;
}

export function sessionCookie(token: string, req: Request): string {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || null;
  }
  return null;
}

export async function destroySession(req: Request): Promise<void> {
  const t = readToken(req);
  if (t) await sql(`delete from sessions where token_hash = $1`, [sha(t)]);
}

export async function currentUser(req: Request): Promise<AuthUser | null> {
  const t = readToken(req);
  if (!t || t.length > 100) return null;
  const rows = await sql<AuthUser>(
    `select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    [sha(t)]
  );
  return rows[0] ?? null;
}

/** Mbrojtje CSRF: kërkesat që ndryshojnë të dhëna duhet të vijnë nga i njëjti domain. */
export function checkOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Kërkesë nga një burim i palejuar.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Kërkesë e pavlefshme.");
  }
}

/** Kthen përdoruesin e identifikuar dhe databazën e kufizuar te të dhënat e tij. */
export async function requireUser(req: Request): Promise<{ user: AuthUser; db: Db }> {
  checkOrigin(req);
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Nuk je i identifikuar. Hyr përsëri.");
  return { user, db: userDb(user.id) };
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

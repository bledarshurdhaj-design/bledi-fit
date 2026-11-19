import { sql } from "@/lib/db";
import { checkOrigin, createSession, handle, HttpError, json, readJson, sessionCookie, str, verifyPassword } from "@/lib/server";

export const runtime = "nodejs";

// Kufizim i thjeshtë i përpjekjeve (10 në 15 minuta për IP + email)
const attempts = new Map<string, { n: number; until: number }>();

export const POST = handle(async (req) => {
  checkOrigin(req);
  const body = await readJson<{ email?: string; password?: string }>(req, 5_000);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const key = `${ip}|${email}`;
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= 10) throw new HttpError(429, "Shumë përpjekje. Provo pas 15 minutash.");

  const rows = await sql<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [email]);
  const ok = rows[0] ? await verifyPassword(password, rows[0].password_hash) : false;
  if (!ok) {
    const cur = a && a.until > now ? a : { n: 0, until: now + 15 * 60_000 };
    cur.n++;
    attempts.set(key, cur);
    throw new HttpError(401, "Email ose fjalëkalim i gabuar.");
  }
  attempts.delete(key);
  const token = await createSession(rows[0].id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, req) });
});

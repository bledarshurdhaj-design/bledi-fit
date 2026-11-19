import { sql } from "@/lib/db";
import { checkOrigin, createSession, handle, hashPassword, HttpError, json, readJson, sessionCookie, str } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Regjistrimi. Si parazgjedhje lejohet VETËM llogaria e parë (aplikacion personal).
 * Për të lejuar llogari të tjera vendos ALLOW_SIGNUP=true.
 */
export const POST = handle(async (req) => {
  checkOrigin(req);
  const body = await readJson<{ email?: string; password?: string }>(req, 5_000);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Shkruaj një email të vlefshëm.");
  if (password.length < 8 || password.length > 200) throw new HttpError(400, "Fjalëkalimi duhet të ketë 8–200 karaktere.");

  const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from users");
  if (n > 0 && process.env.ALLOW_SIGNUP !== "true") {
    throw new HttpError(403, "Regjistrimet e reja janë të mbyllura. Hyr me llogarinë ekzistuese.");
  }
  const exists = await sql("select 1 from users where email = $1", [email]);
  if (exists.length) throw new HttpError(409, "Ky email është i regjistruar. Hyr me fjalëkalimin.");

  const hash = await hashPassword(password);
  const [user] = await sql<{ id: string }>("insert into users (email, password_hash) values ($1, $2) returning id", [email, hash]);
  await sql("insert into profiles (user_id) values ($1) on conflict do nothing", [user.id]);
  const token = await createSession(user.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, req) });
});

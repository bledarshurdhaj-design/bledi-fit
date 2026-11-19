import { checkOrigin, clearCookie, destroySession, handle, json } from "@/lib/server";

export const runtime = "nodejs";

export const POST = handle(async (req) => {
  checkOrigin(req);
  await destroySession(req);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});

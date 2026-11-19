import { runSpec } from "@/lib/db";
import { handle, json, readJson, requireUser } from "@/lib/server";
import type { QuerySpec } from "@/lib/qb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pika e vetme e të dhënave për aplikacionin: çdo pyetje kufizohet te përdoruesi i identifikuar. */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  const spec = await readJson<QuerySpec>(req, 200_000);
  if (!spec || typeof spec.table !== "string" || typeof spec.action !== "string") return json({ data: null, error: { message: "Kërkesë e pavlefshme." } }, 400);
  spec.filters = Array.isArray(spec.filters) ? spec.filters : [];
  spec.order = Array.isArray(spec.order) ? spec.order : [];
  const result = await runSpec(user.id, spec);
  return json(result);
});

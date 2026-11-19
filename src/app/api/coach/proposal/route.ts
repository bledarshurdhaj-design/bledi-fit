import { buildCoachContext } from "@/lib/coachContext";
import { validateChange } from "@/lib/proposals";
import { handle, HttpError, json, readJson, requireUser } from "@/lib/server";
import type { PlanProposal } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  action?: "accept" | "reject" | "apply_rule";
  id?: number;
}

/**
 * Përdoruesi pranon ose refuzon një propozim. Ndryshimi i planit ndodh VETËM këtu,
 * pas konfirmimit të përdoruesit, dhe rivalidohet në server.
 */
export const POST = handle(async (req) => {
  const { user, db } = await requireUser(req);
  const body = await readJson<Body>(req, 5_000);
  const now = new Date().toISOString();

  if (body.action === "apply_rule") {
    // Sugjerimi i raportit javor: serveri e rillogarit nga të dhënat reale (jo nga klienti)
    const { profile, context } = await buildCoachContext(db, user.id);
    const s = context.sugjerim_rregulli_automatik;
    if (!s) throw new HttpError(409, "Me të dhënat aktuale nuk ka sugjerim për ndryshim.");
    const err = validateChange(s.field, s.new_value, profile);
    if (err) throw new HttpError(400, err);
    const { error } = await db.from("profiles").update({ [s.field]: s.new_value }).eq("user_id", user.id);
    if (error) throw new HttpError(400, error.message);
    await db.from("plan_proposals").insert({
      user_id: user.id, field: s.field, old_value: s.old_value, new_value: s.new_value,
      reason: s.reason, status: "accepted", decided_at: now,
    });
    return json({ ok: true, field: s.field, new_value: s.new_value });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "ID e pavlefshme.");
  const { data: prop } = await db.from("plan_proposals").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!prop) throw new HttpError(404, "Propozimi nuk u gjet.");
  const p = prop as PlanProposal;
  if (p.status !== "pending") throw new HttpError(409, "Ky propozim është vendosur tashmë.");

  if (body.action === "reject") {
    await db.from("plan_proposals").update({ status: "rejected", decided_at: now }).eq("id", id);
    return json({ ok: true });
  }
  if (body.action !== "accept") throw new HttpError(400, "Veprim i pavlefshëm.");

  const { data: profile } = await db.from("profiles").select("*").eq("user_id", user.id).single();
  if (!profile) throw new HttpError(404, "Profili nuk u gjet.");
  const err = validateChange(p.field, Number(p.new_value), profile);
  if (err) throw new HttpError(400, err);
  const { error } = await db.from("profiles").update({ [p.field]: Number(p.new_value) }).eq("user_id", user.id);
  if (error) throw new HttpError(400, error.message);
  await db.from("plan_proposals").update({ status: "accepted", decided_at: now }).eq("id", id);
  return json({ ok: true, field: p.field, new_value: Number(p.new_value) });
});

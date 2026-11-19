import { callAI, type AIMessage } from "@/lib/ai";
import { buildCoachContext } from "@/lib/coachContext";
import { COACH_SYSTEM, MODE_INSTRUCTIONS, PROPOSE_TOOL } from "@/lib/coachPrompt";
import { isField, validateChange } from "@/lib/proposals";
import { handle, HttpError, intIn, json, readJson, requireUser, str } from "@/lib/server";
import { addDays } from "@/lib/dates";
import type { Db } from "@/lib/qb";

export const runtime = "nodejs";
export const maxDuration = 60;

type Mode = "chat" | "craving" | "checkin" | "weekly";

interface Body {
  mode?: Mode;
  message?: string;
  kind?: "hungry" | "craving" | "already_ate";
  note?: string;
  hunger?: number;
  energy?: number;
}

async function enforceDailyLimit(db: Db, userId: string) {
  const limit = Number(process.env.AI_DAILY_LIMIT || 60);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);
  if ((count ?? 0) >= limit) throw new HttpError(429, `Ke arritur limitin prej ${limit} kërkesash AI në 24 orë. Provo më vonë.`);
}

export const POST = handle(async (req) => {
  const { user, db } = await requireUser(req);
  const body = await readJson<Body>(req, 20_000);
  const MODES: Mode[] = ["chat", "craving", "checkin", "weekly"];
  const mode: Mode = body.mode && MODES.includes(body.mode) ? body.mode : "chat";

  await enforceDailyLimit(db, user.id);
  const { profile, today, context } = await buildCoachContext(db, user.id);

  // ----- Hyrja e përdoruesit sipas modalitetit -----
  let userText = "";
  if (mode === "chat") {
    userText = str(body.message, 2000);
    if (!userText) throw new HttpError(400, "Shkruaj një mesazh.");
  } else if (mode === "craving") {
    const kind = body.kind;
    if (kind !== "hungry" && kind !== "craving" && kind !== "already_ate") throw new HttpError(400, "Zgjidh një opsion.");
    const note = str(body.note, 300);
    // Ngjarja ruhet nga klienti në momentin e zgjedhjes (funksionon edhe pa AI)
    const label = { hungry: "Kam URI FIZIKE.", craving: "Është vetëm DËSHIRË (craving), jo uri.", already_ate: "KAM NGRËNË TASHMË diçka jashtë planit." }[kind];
    userText = `DUA TË HA – MË NDIHMO. ${label}${note ? " Shënim: " + note : ""}`;
  } else if (mode === "checkin") {
    const hunger = intIn(body.hunger, 1, 5);
    const energy = intIn(body.energy, 1, 5);
    if (hunger === null || energy === null) throw new HttpError(400, "Zgjidh urinë dhe energjinë (1–5).");
    const note = str(body.note, 500);
    const { error } = await db.from("daily_checkins").upsert({ user_id: user.id, day: today, hunger, energy, note: note || null });
    if (error) throw new HttpError(500, error.message);
    // rifresko kontekstin që të përfshijë check-in-in e sotëm
    const fresh = await buildCoachContext(db, user.id);
    Object.assign(context, fresh.context);
    userText = `Check-in ditor: uria ${hunger}/5, energjia ${energy}/5.${note ? " Shënim: " + note : ""}`;
  } else {
    userText = "Bëj analizën javore të 7 ditëve të fundit.";
  }

  // ----- Historia e bisedës (vetëm për chat) -----
  const messages: AIMessage[] = [];
  if (mode === "chat") {
    const { data: hist } = await db
      .from("ai_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("mode", "chat")
      .order("created_at", { ascending: false })
      .limit(16);
    for (const m of (hist ?? []).reverse()) messages.push({ role: m.role as "user" | "assistant", content: m.content });
    // API kërkon që biseda të fillojë me "user"
    while (messages.length && messages[0].role !== "user") messages.shift();
  }
  messages.push({
    role: "user",
    content: `TË DHËNAT REALE NGA APLIKACIONI (JSON):\n${JSON.stringify(context)}\n\n---\n${userText}`,
  });
  // Bashko mesazhet e njëpasnjëshme me të njëjtin rol (siguri për API)
  const merged: AIMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      last.content += "\n\n" + m.content;
    } else merged.push({ ...m });
  }

  const allowProposals = mode === "weekly" || mode === "chat" || mode === "checkin";
  const result = await callAI({
    system: `${COACH_SYSTEM}\n\n${MODE_INSTRUCTIONS[mode]}`,
    messages: merged,
    tools: allowProposals ? [PROPOSE_TOOL] : undefined,
    toolChoice: allowProposals ? { type: "auto" } : undefined,
    maxTokens: mode === "weekly" ? 1400 : 800,
  });

  // ----- Propozimet: validohen nga serveri dhe ruhen si "në pritje" -----
  const proposals: { field: string; old_value: number; new_value: number; reason: string; error?: string }[] = [];
  for (const t of result.toolUses) {
    if (t.name !== "propose_plan_change") continue;
    const field = t.input.field;
    const newValue = Number(t.input.new_value);
    const reason = str(t.input.reason, 600);
    if (!isField(field) || !reason) continue;
    const err = validateChange(field, newValue, profile);
    if (err) {
      proposals.push({ field, old_value: Number(profile[field]), new_value: newValue, reason, error: err });
      continue;
    }
    // mos krijo dublikatë për të njëjtën fushë
    await db.from("plan_proposals").update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("field", field).eq("status", "pending");
    await db.from("plan_proposals").insert({
      user_id: user.id, field, old_value: Number(profile[field]), new_value: newValue, reason,
    });
    proposals.push({ field, old_value: Number(profile[field]), new_value: newValue, reason });
  }

  let reply = result.text;
  if (!reply && proposals.length) reply = "Të përgatita një propozim për planin – shiko më poshtë dhe vendos nëse e pranon.";
  if (!reply) reply = "Nuk mora përgjigje nga AI. Provo përsëri.";

  // ----- Ruaj historinë dhe raportet -----
  await db.from("ai_messages").insert([
    { user_id: user.id, role: "user", mode, content: userText.slice(0, 8000) },
    { user_id: user.id, role: "assistant", mode, content: reply.slice(0, 8000) },
  ]);
  if (mode === "checkin" || mode === "weekly") {
    await db.from("ai_reports").upsert(
      {
        user_id: user.id,
        kind: mode === "checkin" ? "daily" : "weekly",
        period_start: mode === "checkin" ? today : addDays(today, -6),
        stats: context,
        content: reply.slice(0, 8000),
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind,period_start" }
    );
  }

  return json({ reply, proposals, missing: context.te_dhena_qe_mungojne });
});

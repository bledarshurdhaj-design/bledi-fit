import { callAI, type AIContent } from "@/lib/ai";
import { ESTIMATE_SYSTEM, ESTIMATE_TOOL } from "@/lib/coachPrompt";
import { handle, HttpError, json, readJson, requireUser, str } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  description?: string;
  image?: string; // data URL base64 (jpeg/png/webp)
}

const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, max) : 0;
};

export const POST = handle(async (req) => {
  const { user, db } = await requireUser(req);
  const body = await readJson<Body>(req, 3_000_000);
  const description = str(body.description, 600);
  const content: AIContent[] = [];

  if (body.image) {
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!m) throw new HttpError(400, "Formati i fotos nuk mbështetet (JPEG, PNG ose WEBP).");
    if (m[3].length > 2_800_000) throw new HttpError(413, "Fotoja është shumë e madhe.");
    content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[3] } });
  }
  if (!description && !content.length) throw new HttpError(400, "Përshkruaj ushqimin ose shto një foto.");
  content.push({
    type: "text",
    text: description ? `Përshkrimi i përdoruesit: ${description}` : "Vlerëso ushqimin në foto.",
  });

  const limit = Number(process.env.AI_DAILY_LIMIT || 60);
  const { count } = await db.from("ai_messages").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("role", "user").gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if ((count ?? 0) >= limit) throw new HttpError(429, `Ke arritur limitin prej ${limit} kërkesash AI në 24 orë.`);

  const result = await callAI({
    system: ESTIMATE_SYSTEM,
    messages: [{ role: "user", content }],
    tools: [ESTIMATE_TOOL],
    toolChoice: { type: "tool", name: ESTIMATE_TOOL.name },
    maxTokens: 900,
  });

  const t = result.toolUses.find((u) => u.name === ESTIMATE_TOOL.name);
  if (!t) throw new HttpError(502, "AI nuk ktheu vlerësim. Provo përsëri.");
  const rawItems = Array.isArray(t.input.items) ? (t.input.items as Record<string, unknown>[]) : [];
  const items = rawItems.slice(0, 12).map((i) => ({
    name: str(i.name, 100) || "Ushqim",
    grams: num(i.grams, 3000),
    kcal: num(i.kcal, 5000),
    protein: num(i.protein, 300),
    carbs: num(i.carbs, 600),
    fat: num(i.fat, 300),
  })).filter((i) => i.grams > 0);

  const note = str(t.input.note, 500);
  const confidence = str(t.input.confidence, 20) || "mesatare";

  await db.from("ai_messages").insert([
    { user_id: user.id, role: "user", mode: "estimate", content: description || "[foto e ushqimit]" },
    {
      user_id: user.id, role: "assistant", mode: "estimate",
      content: `Vlerësim (${confidence}): ` + items.map((i) => `${i.name} ${i.grams} g ≈${i.kcal} kcal, ${i.protein} g proteinë`).join("; ") + (note ? ` — ${note}` : ""),
    },
  ]);

  return json({ items, confidence, note });
});

import { HttpError } from "./errors";

export type AIContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface AIMessage {
  role: "user" | "assistant";
  content: string | AIContent[];
}

export interface AITool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AIResult {
  text: string;
  toolUses: { name: string; input: Record<string, unknown> }[];
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Thirrje në Anthropic Messages API – çelësi qëndron vetëm në server. */
export async function callAI(opts: {
  system: string;
  messages: AIMessage[];
  tools?: AITool[];
  toolChoice?: { type: "auto" } | { type: "tool"; name: string };
  maxTokens?: number;
}): Promise<AIResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, "AI Coach nuk është konfiguruar në server (mungon ANTHROPIC_API_KEY).");

  const body: Record<string, unknown> = {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: opts.maxTokens ?? 900,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new HttpError(504, "AI nuk u përgjigj në kohë. Provo përsëri.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("AI error", res.status, detail.slice(0, 500));
    if (res.status === 429 || res.status === 529) throw new HttpError(503, "AI është i ngarkuar për momentin. Provo pas pak.");
    if (res.status === 401) throw new HttpError(503, "Çelësi i AI në server është i pavlefshëm.");
    throw new HttpError(502, "AI ktheu një gabim. Provo përsëri.");
  }

  const data = (await res.json()) as {
    content: ({ type: "text"; text: string } | { type: "tool_use"; name: string; input: Record<string, unknown> })[];
  };
  const text = data.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  const toolUses = data.content
    .filter((c): c is { type: "tool_use"; name: string; input: Record<string, unknown> } => c.type === "tool_use")
    .map((c) => ({ name: c.name, input: c.input }));
  return { text, toolUses };
}

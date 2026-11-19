"use client";

/** Thirrje drejt API-ve të serverit (sesioni dërgohet me cookie). */
export async function api<T = unknown>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Je offline. AI Coach dhe ruajtja kërkojnë internet.");
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Nuk u lidh me serverin. Kontrollo internetin.");
  }
  if (res.status === 401 && typeof window !== "undefined") {
    location.href = "/login";
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Gabim në server (${res.status}).`);
  return json as T;
}

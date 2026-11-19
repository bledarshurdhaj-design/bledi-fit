"use client";
import { sb } from "./supabaseClient";

/** Thirrje drejt API-ve të serverit me token-in e përdoruesit. */
export async function api<T = unknown>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Je offline. AI Coach dhe ruajtja kërkojnë internet.");
  }
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Nuk u lidh me serverin. Kontrollo internetin.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Gabim në server (${res.status}).`);
  return json as T;
}

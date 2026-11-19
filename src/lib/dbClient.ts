"use client";
import { makeDb, type Db, type QueryResult, type QuerySpec } from "./qb";

let client: Db | null = null;

async function transport(spec: QuerySpec): Promise<QueryResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { data: null, error: { message: "Je offline. Lidhu me internet dhe provo përsëri." } };
  }
  let res: Response;
  try {
    res = await fetch("/api/db", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
  } catch {
    return { data: null, error: { message: "Nuk u lidh me serverin. Kontrollo internetin." } };
  }
  if (res.status === 401) {
    if (typeof window !== "undefined" && location.pathname !== "/login") location.href = "/login";
    return { data: null, error: { message: "Sesioni ka skaduar. Hyr përsëri." } };
  }
  const json = (await res.json().catch(() => null)) as QueryResult | null;
  if (!json) return { data: null, error: { message: `Gabim në server (${res.status}).` } };
  return json;
}

/** Klienti i databazës (të dhënat kalojnë gjithmonë përmes serverit). */
export function sb(): Db {
  if (!client) client = makeDb(transport);
  return client;
}

/** Hedh gabim në shqip nëse kërkesa dështon. */
export function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase nuk është konfiguruar (mungojnë NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Hedh gabim në shqip nëse kërkesa dështon. */
export function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Je offline. Lidhu me internet dhe provo përsëri.");
    throw new Error(res.error.message);
  }
  return res.data as T;
}

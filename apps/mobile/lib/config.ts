/**
 * Runtime configuration, sourced from EXPO_PUBLIC_* env vars (baked at build time
 * by EAS, see eas.json) with sensible local-dev fallbacks.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

// The Corelyx web app the mobile client calls (all data + auth go through it).
export const API_BASE_URL = env("EXPO_PUBLIC_API_BASE_URL", "http://localhost:3000");

// Same Supabase project as web. Anon key + PKCE — the mobile client establishes
// its own session in secure storage (not cookies).
export const SUPABASE_URL = env("EXPO_PUBLIC_SUPABASE_URL", "");
export const SUPABASE_ANON_KEY = env("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");

export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

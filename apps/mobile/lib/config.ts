/**
 * Runtime configuration, sourced from EXPO_PUBLIC_* env vars (baked at build time
 * by EAS, see eas.json) with fallbacks that keep every build path working.
 *
 * Release builds fall back to the PRODUCTION values when the env wasn't baked
 * in. The v0.1.0 sideload APK shipped without these envs, so lib/supabase's
 * module-scope createClient("") threw "supabaseUrl is required." during bundle
 * evaluation — the app closed the instant it opened, on every device. These
 * values are public client-side config (the same ones committed in eas.json),
 * not secrets, so hard defaults are safe — and mean a bare `gradlew
 * assembleRelease` or `eas build --local` without env still produces a
 * working app.
 */

// Production defaults for release builds; local dev keeps pointing at the dev
// web server unless explicitly overridden.
// Canonical web host — app.corelyx.app is NOT configured in DNS (the v0.1.1
// build pointed there and every API call failed with a network error).
const PROD_API_BASE_URL = "https://www.corelyx.app";
const PROD_SUPABASE_URL = "https://fzvmsejkqjbqyavxvirf.supabase.co";
const PROD_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dm1zZWprcWpicXlhdnh2aXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MjU4NTMsImV4cCI6MjA5MTAwMTg1M30.JPuLdos3w9h85reCWKxN4j3iJDDvvMpNkfWkps86bQo";

// The Corelyx web app the mobile client calls (all data + auth go through it).
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const API_BASE_URL =
  configuredApiBaseUrl || (__DEV__ ? "http://localhost:3000" : PROD_API_BASE_URL);

// Same Supabase project as web. Anon key + PKCE — the mobile client establishes
// its own session in secure storage (not cookies).
export const SUPABASE_URL =
  configuredSupabaseUrl || (__DEV__ ? "" : PROD_SUPABASE_URL);
export const SUPABASE_ANON_KEY =
  configuredSupabaseAnonKey || (__DEV__ ? "" : PROD_SUPABASE_ANON_KEY);

export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

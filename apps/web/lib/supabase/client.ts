import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database } from "@flowos/db";

let _client: ReturnType<typeof _createBrowserClient<Database>> | null = null;

export function createBrowserClient() {
  if (_client) return _client;
  _client = _createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Required for /auth/callback route that exchanges OAuth code server-side.
        flowType: "pkce",
      },
    }
  );
  return _client;
}

import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import * as React from "react";
import type { Database } from "@flowos/db";

// React.cache only exists in the react-server build; fall back to the plain
// function in other runtimes (e.g. vitest) where per-request memoization is moot.
const requestMemo: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T extends (...args: never[]) => unknown>(fn: T) => T }).cache ??
  ((fn) => fn);

/**
 * Server-verified user for the current request, deduplicated across the
 * layout and page of the same render tree. `auth.getUser()` is a network
 * round trip to Supabase — without this cache every navigation paid it
 * twice (layout + page).
 */
export const getRequestUser = requestMemo(async () => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function createServerClient() {
  const cookieStore = await cookies();

  return _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored when called from a Server Component
          }
        },
      },
    }
  );
}

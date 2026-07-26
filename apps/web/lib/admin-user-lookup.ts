/**
 * Admin-side user lookup by email.
 *
 * Emails live in `auth.users`, which PostgREST does not expose, so these
 * helpers prefer the `admin_search_users` SECURITY DEFINER function added in
 * migration 20260725130000 and fall back to paging the GoTrue admin API when
 * that migration has not been applied yet.
 *
 * The fallback exists because GoTrue's admin API has no server-side email
 * filter: callers that used `listUsers()` directly were silently searching only
 * the first page of accounts (50 by default), so any user outside that page
 * appeared not to exist.
 *
 * Both helpers take a service-role client and must only ever be called from a
 * route that has already established the caller is an admin.
 */

export type AdminUserMatch = { id: string; email: string; created_at: string };

/** GoTrue caps perPage; 1000 is the practical maximum it honours. */
const FALLBACK_PAGE_SIZE = 1000;
/** Bounds the crawl so one lookup cannot walk an unbounded number of pages. */
const FALLBACK_MAX_PAGES = 10;

type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: AdminUserMatch[] | null; error: { message: string } | null }>;
};

type AdminApiClient = {
  auth: {
    admin: {
      listUsers(params: { page: number; perPage: number }): Promise<{
        data: { users: Array<{ id: string; email?: string; created_at: string }> } | null;
        error: unknown;
      }>;
    };
  };
};

/**
 * Walk the GoTrue user list, handing each page to `visit`.
 * `visit` returns true to stop early.
 */
async function eachUserPage(
  service: unknown,
  visit: (users: Array<{ id: string; email?: string; created_at: string }>) => boolean,
): Promise<void> {
  for (let page = 1; page <= FALLBACK_MAX_PAGES; page++) {
    const { data, error } = await (service as AdminApiClient).auth.admin.listUsers({
      page,
      perPage: FALLBACK_PAGE_SIZE,
    });
    if (error || !data) return;
    if (visit(data.users)) return;
    // A short page means this was the last one.
    if (data.users.length < FALLBACK_PAGE_SIZE) return;
  }
}

/**
 * Substring match on email across all accounts, for autocomplete.
 *
 * `viaRpc` in the result tells the caller which path ran, which is worth
 * recording in the audit log — the fallback is bounded and can miss matches in
 * a very large tenant, so a run of `admin_api_fallback` entries is the signal
 * that the migration still needs applying.
 */
export async function searchUsersByEmail(
  service: unknown,
  query: string,
  limit = 8,
): Promise<{ users: AdminUserMatch[]; viaRpc: boolean }> {
  const q = query.trim();
  if (!q) return { users: [], viaRpc: false };

  const { data, error } = await (service as RpcClient).rpc("admin_search_users", {
    p_query: q,
    p_limit: limit,
  });
  if (!error) return { users: data ?? [], viaRpc: true };

  const needle = q.toLowerCase();
  const matches: AdminUserMatch[] = [];
  await eachUserPage(service, (users) => {
    for (const u of users) {
      if (u.email?.toLowerCase().includes(needle)) {
        matches.push({ id: u.id, email: u.email, created_at: u.created_at });
        if (matches.length >= limit) return true;
      }
    }
    return false;
  });

  return { users: matches, viaRpc: false };
}

/** Exact (case-insensitive) email lookup — for "add this specific person". */
export async function findUserByExactEmail(
  service: unknown,
  email: string,
): Promise<AdminUserMatch | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const { users, viaRpc } = await searchUsersByEmail(service, target, 25);
  const exact = users.find((u) => u.email?.toLowerCase() === target);
  if (exact) return exact;

  // The RPC returns at most `limit` substring matches ordered exact-first, so
  // if it ran and produced no exact hit there is nothing more to find. The
  // fallback is bounded and can stop early on a common substring, so re-scan
  // for the exact address before concluding the account does not exist.
  if (viaRpc) return null;

  let found: AdminUserMatch | null = null;
  await eachUserPage(service, (list) => {
    for (const u of list) {
      if (u.email?.toLowerCase() === target) {
        found = { id: u.id, email: u.email, created_at: u.created_at };
        return true;
      }
    }
    return false;
  });

  return found;
}

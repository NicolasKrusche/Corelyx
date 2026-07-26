import { describe, expect, it, vi } from "vitest";
import { searchUsersByEmail, findUserByExactEmail } from "@/lib/admin-user-lookup";

type FakeUser = { id: string; email: string; created_at: string };

function user(n: number, email?: string): FakeUser {
  return {
    id: `id-${n}`,
    email: email ?? `user${n}@example.com`,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

/** Service client whose admin_search_users RPC works. */
function clientWithRpc(rows: FakeUser[]) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  return { client: { rpc, auth: { admin: { listUsers: vi.fn() } } }, rpc };
}

/**
 * Service client from a database where migration 20260725130000 has not been
 * applied: the RPC errors and the GoTrue admin API serves `users` in pages.
 */
function clientWithoutRpc(users: FakeUser[], pageSize = 1000) {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    error: { message: 'function public.admin_search_users does not exist' },
  });
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
    const start = (page - 1) * perPage;
    return { data: { users: users.slice(start, start + Math.min(perPage, pageSize)) }, error: null };
  });
  return { client: { rpc, auth: { admin: { listUsers } } }, listUsers };
}

describe("searchUsersByEmail", () => {
  it("uses the RPC and reports which path ran", async () => {
    const { client, rpc } = clientWithRpc([user(1), user(2)]);

    const result = await searchUsersByEmail(client, "user", 8);

    expect(result.viaRpc).toBe(true);
    expect(result.users).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith("admin_search_users", { p_query: "user", p_limit: 8 });
  });

  it("returns nothing for a blank query without calling out", async () => {
    const { client, rpc } = clientWithRpc([user(1)]);

    const result = await searchUsersByEmail(client, "   ");

    expect(result.users).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to the admin API when the RPC is missing", async () => {
    const { client, listUsers } = clientWithoutRpc([user(1), user(2, "someone@corp.com")]);

    const result = await searchUsersByEmail(client, "someone");

    expect(result.viaRpc).toBe(false);
    expect(result.users).toEqual([expect.objectContaining({ email: "someone@corp.com" })]);
    expect(listUsers).toHaveBeenCalled();
  });

  it("finds a match past the first page — the bug that made the old search look empty", async () => {
    // The previous implementation asked for a single 10-user page and filtered
    // it in JS, so any account outside that page simply did not exist as far as
    // the admin UI was concerned.
    const many = Array.from({ length: 2500 }, (_, i) => user(i));
    many[2200] = user(2200, "needle@example.com");
    const { client } = clientWithoutRpc(many);

    const result = await searchUsersByEmail(client, "needle@example.com");

    expect(result.users).toEqual([expect.objectContaining({ id: "id-2200" })]);
  });

  it("stops at the requested limit", async () => {
    const many = Array.from({ length: 50 }, (_, i) => user(i, `match${i}@example.com`));
    const { client } = clientWithoutRpc(many);

    const result = await searchUsersByEmail(client, "match", 5);

    expect(result.users).toHaveLength(5);
  });

  it("matches case-insensitively in the fallback", async () => {
    const { client } = clientWithoutRpc([user(1, "Mixed.Case@Example.com")]);

    const result = await searchUsersByEmail(client, "mixed.case@example.com");

    expect(result.users).toHaveLength(1);
  });
});

describe("findUserByExactEmail", () => {
  it("picks the exact address out of substring matches", async () => {
    const { client } = clientWithRpc([
      user(1, "team@corelyx.app"),
      user(2, "team-lead@corelyx.app"),
    ]);

    const found = await findUserByExactEmail(client, "team@corelyx.app");

    expect(found?.id).toBe("id-1");
  });

  it("is case-insensitive", async () => {
    const { client } = clientWithRpc([user(1, "Team@Corelyx.app")]);

    expect((await findUserByExactEmail(client, "team@corelyx.app"))?.id).toBe("id-1");
  });

  it("returns null when the address has no account", async () => {
    const { client } = clientWithRpc([]);

    expect(await findUserByExactEmail(client, "nobody@example.com")).toBeNull();
  });

  it("returns null for a blank address", async () => {
    const { client, rpc } = clientWithRpc([user(1)]);

    expect(await findUserByExactEmail(client, "  ")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("finds an exact match the bounded fallback scan would otherwise miss", async () => {
    // "a@example.com" is a substring of thousands of addresses, so the first
    // fallback pass fills its result cap with near-misses. The exact-match
    // rescan is what stops that from reporting "no user found".
    const many = Array.from({ length: 100 }, (_, i) => user(i, `a@example.com.${i}`));
    many.push(user(999, "a@example.com"));
    const { client } = clientWithoutRpc(many);

    const found = await findUserByExactEmail(client, "a@example.com");

    expect(found?.id).toBe("id-999");
  });

  it("does not rescan when the RPC already answered", async () => {
    const { client, rpc } = clientWithRpc([user(1, "other@example.com")]);

    const found = await findUserByExactEmail(client, "missing@example.com");

    expect(found).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(client.auth.admin.listUsers).not.toHaveBeenCalled();
  });
});

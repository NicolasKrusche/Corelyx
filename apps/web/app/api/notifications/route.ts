import { NextResponse } from "next/server";
import { apiError, getAuthUser, createServiceClient } from "@/lib/api";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

// GET /api/notifications — fetch the caller's unread notifications.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { data, error } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): {
          is(c: string, v: null): {
            order(c: string, o: { ascending: boolean }): {
              limit(n: number): Promise<{ data: AppNotification[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  })
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ notifications: data ?? [] });
}

// POST /api/notifications/read — mark all as read (called on panel open).
// Using POST on the base route with action param to avoid an extra directory.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  await (service as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): {
          is(c: string, v: null): Promise<unknown>;
        };
      };
    };
  })
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ ok: true });
}

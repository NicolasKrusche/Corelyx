import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  content: z.record(z.unknown()).optional(),
  cover_image_url: z.string().url().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).optional(),
  author_name: z.string().min(1).max(100).optional(),
});

type DbError = { message: string; code?: string };

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return apiError("Forbidden", 403);

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data, error } = await db.from("posts").select("*").eq("id", id).single();

  if (error) return apiError((error as DbError).message, (error as DbError).code === "PGRST116" ? 404 : 500);
  return NextResponse.json({ post: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return apiError("Forbidden", 403);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data, error } = await db
    .from("posts")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return apiError((error as DbError).message, 500);
  return NextResponse.json({ post: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return apiError("Forbidden", 403);

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { error } = await db.from("posts").delete().eq("id", id);

  if (error) return apiError((error as DbError).message, 500);
  return new NextResponse(null, { status: 204 });
}

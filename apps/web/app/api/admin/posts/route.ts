import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  content: z.record(z.unknown()),
  cover_image_url: z.string().url().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).default([]),
  author_name: z.string().min(1).max(100).default("Corelyx Team"),
});

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return apiError("Forbidden", 403);

  const db = createServiceClient() as any;
  const { data, error } = await db
    .from("posts")
    .select("id, title, slug, cover_image_url, published_at, tags, author_name, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return apiError((error as { message: string }).message, 500);
  return NextResponse.json({ posts: data });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 400);

  const db = createServiceClient() as any;
  const { data, error } = await db
    .from("posts")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return apiError((error as { message: string }).message, 500);
  return NextResponse.json({ post: data }, { status: 201 });
}

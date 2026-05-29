import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { PostEditorForm } from "@/components/post-editor-form";

type Post = {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  cover_image_url: string | null;
  published_at: string | null;
  tags: string[];
  author_name: string;
};

export default async function AdminEditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/posts");
  if (!isAdminEmail(user.email)) redirect("/admin");

  const db = createServiceClient() as any;
  const { data, error } = await db.from("posts").select("*").eq("id", id).single();
  if (error || !data) redirect("/admin/posts");

  return <PostEditorForm post={data as Post} />;
}

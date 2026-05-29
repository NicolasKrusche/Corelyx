import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { PostEditorForm } from "@/components/post-editor-form";

export default async function AdminNewPostPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/posts/new");
  if (!isAdminEmail(user.email)) redirect("/admin");

  return <PostEditorForm />;
}

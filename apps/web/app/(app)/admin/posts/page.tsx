import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { Plus, FileText, Eye, EyeOff } from "lucide-react";

type Post = {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  published_at: string | null;
  tags: string[];
  author_name: string;
  created_at: string;
  updated_at: string;
};

export default async function AdminPostsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/posts");
  if (!isAdminEmail(user.email)) redirect("/admin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data } = await db
    .from("posts")
    .select("id, title, slug, cover_image_url, published_at, tags, author_name, created_at, updated_at")
    .order("created_at", { ascending: false });

  const posts = (data ?? []) as Post[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
          <p className="text-muted-foreground">Manage the Corelyx in-app blog</p>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No posts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first post to get started.</p>
          <Link
            href="/admin/posts/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New post
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {posts.map((post) => {
              const isPublished = post.published_at && new Date(post.published_at) <= new Date();
              return (
                <div key={post.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                  {post.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.cover_image_url}
                      alt=""
                      className="h-12 w-20 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-20 shrink-0 rounded bg-muted flex items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">{post.title}</p>
                      {post.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.author_name} · {isPublished ? "Published" : "Draft"} ·{" "}
                      {new Date(post.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {isPublished ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <Eye className="h-3.5 w-3.5" /> Live
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <EyeOff className="h-3.5 w-3.5" /> Draft
                      </span>
                    )}
                    <Link
                      href={`/admin/posts/${post.id}`}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createServiceClient } from "@/lib/api";
import { FileText } from "lucide-react";

type Post = {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  published_at: string;
  tags: string[];
  author_name: string;
};

export const metadata = {
  title: "Updates",
};

export default async function UpdatesPage() {
  const db = createServiceClient() as any;
  const { data } = await db
    .from("posts")
    .select("id, title, slug, cover_image_url, published_at, tags, author_name")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  const posts = (data ?? []) as Post[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Updates</h1>
        <p className="text-muted-foreground">News and updates from the Corelyx team</p>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No posts yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/updates/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card hover:border-primary/40 transition-colors"
            >
              {post.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.cover_image_url}
                  alt=""
                  className="h-44 w-full object-cover"
                />
              ) : (
                <div className="h-44 w-full bg-muted flex items-center justify-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h2>
                <p className="mt-auto text-xs text-muted-foreground">
                  {post.author_name} · {new Date(post.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

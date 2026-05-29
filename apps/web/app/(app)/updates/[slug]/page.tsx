import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/api";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { ArrowLeft } from "lucide-react";

type Post = {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  cover_image_url: string | null;
  published_at: string;
  tags: string[];
  author_name: string;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data } = await db.from("posts").select("title").eq("slug", slug).single();
  const post = data as { title: string } | null;
  return { title: post ? `${post.title} – Corelyx` : "Updates – Corelyx" };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .single();

  if (error || !data) notFound();

  const post = data as Post;

  let html = "";
  try {
    html = generateHTML(post.content as Parameters<typeof generateHTML>[0], [StarterKit, Image]);
  } catch {
    html = "";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/updates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All updates
      </Link>

      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_image_url}
          alt=""
          className="w-full rounded-xl object-cover max-h-72"
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
        <p className="text-sm text-muted-foreground">
          {post.author_name} · {new Date(post.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <article
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

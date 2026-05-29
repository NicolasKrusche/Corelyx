"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PostEditor } from "@/components/post-editor";
import { ArrowLeft, Eye, EyeOff, Save, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

export function PostEditorForm({ post }: { post?: Post }) {
  const router = useRouter();
  const isNew = !post;

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!isNew);
  const [authorName, setAuthorName] = useState(post?.author_name ?? "Corelyx Team");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);
  const [content, setContent] = useState<Record<string, unknown>>(post?.content ?? {});
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(post?.cover_image_url ?? null);
  const [published, setPublished] = useState(
    !!post?.published_at && new Date(post.published_at) <= new Date()
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const uploadCover = useCallback(async (file: File) => {
    setCoverUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/posts/upload-image", { method: "POST", body: formData });
    setCoverUploading(false);
    if (!res.ok) { setError("Cover image upload failed."); return; }
    const { url } = await res.json() as { url: string };
    setCoverImageUrl(url);
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    const body = {
      title: title.trim(),
      slug: slug.trim(),
      content,
      cover_image_url: coverImageUrl ?? null,
      published_at: published ? new Date().toISOString() : null,
      tags,
      author_name: authorName.trim(),
    };

    const url = isNew ? "/api/admin/posts" : `/api/admin/posts/${post.id}`;
    const method = isNew ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { error?: string };
      setError(payload.error ?? "Failed to save post.");
      return;
    }

    if (isNew) {
      const { post: created } = await res.json() as { post: Post };
      router.replace(`/admin/posts/${created.id}`);
    } else {
      router.refresh();
    }
  };

  const handleDelete = async () => {
    if (!post || !confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    router.push("/admin/posts");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/posts"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Posts
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{isNew ? "New post" : "Edit post"}</span>
        </div>

        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
          {!isNew && (
            <Link
              href={`/updates/${post.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Link>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !slug.trim()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              (saving || !title.trim() || !slug.trim()) && "opacity-50 cursor-not-allowed"
            )}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main content column */}
        <div className="space-y-4">
          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Post title"
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Rich text editor */}
          <PostEditor content={content} onChange={setContent} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Publish toggle */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Status</h3>
            <button
              type="button"
              onClick={() => setPublished(!published)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
                published
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-border bg-muted/30 text-muted-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                {published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {published ? "Published" : "Draft"}
              </span>
              <span className="text-xs opacity-70">click to toggle</span>
            </button>
          </div>

          {/* Cover image */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Cover image</h3>
            {coverImageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImageUrl} alt="" className="w-full rounded-md object-cover max-h-36" />
                <button
                  type="button"
                  onClick={() => setCoverImageUrl(null)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                <Upload className="h-5 w-5" />
                {coverUploading ? "Uploading…" : "Upload cover image"}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* Slug */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">URL slug</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <span>/updates/</span>
            </div>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              placeholder="my-post-slug"
              className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Author */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Author</h3>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Tags */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  {tag}
                  <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); }}}
                placeholder="Add tag…"
                className="min-w-0 flex-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

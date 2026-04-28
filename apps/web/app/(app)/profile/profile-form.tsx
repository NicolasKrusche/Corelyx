"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/avatar-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileMutation = {
  upsert: (
    value: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
    },
    options: { onConflict: string }
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export function ProfileForm({
  initialDisplayName,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialAvatarUrl: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFileName, setAvatarFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleAvatarUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "Please choose an image file." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ kind: "error", text: "Image too large. Use a file up to 2MB." });
      return;
    }

    try {
      const { publicUrl, fileName } = await uploadAvatar(file);
      setAvatarUrl(publicUrl);
      setAvatarFileName(fileName);
      setMessage({ kind: "ok", text: "Image uploaded. Save changes to apply it." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to upload image.",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage({ kind: "error", text: "Not signed in." });
      setSaving(false);
      return;
    }

    const profiles = supabase.from("profiles") as unknown as ProfileMutation;
    const { error } = await profiles.upsert(
      {
        id: user.id,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      },
      { onConflict: "id" }
    );

    if (error) {
      setMessage({ kind: "error", text: error.message });
    } else {
      setMessage({ kind: "ok", text: "Saved." });
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          className="mt-1"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
        />
      </div>
      <div>
        <Label>Profile photo</Label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent">
            Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleAvatarUpload(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => {
                setAvatarUrl("");
                setAvatarFileName("");
              }}
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Remove image
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {avatarFileName ? `Selected: ${avatarFileName}` : "PNG/JPG/WebP up to 2MB"}
        </p>
      </div>

      {message && (
        <p
          className={
            message.kind === "ok"
              ? "text-xs text-green-400"
              : "text-xs text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

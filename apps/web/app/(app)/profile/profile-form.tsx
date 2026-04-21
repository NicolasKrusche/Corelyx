"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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
        <Label htmlFor="avatarUrl">Avatar URL</Label>
        <Input
          id="avatarUrl"
          className="mt-1"
          placeholder="https://..."
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />
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

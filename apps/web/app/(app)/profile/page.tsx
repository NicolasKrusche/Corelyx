import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { ProfileForm } from "./profile-form";

type ProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
  tier: string | null;
  is_admin: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, tier, is_admin, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileRaw as unknown as ProfileRow | null;
  const createdAt = profile?.created_at ?? user.created_at;
  // Same rule as the credits page: admins are treated as unlimited regardless
  // of the tier column, so the badge never shows "FREE" for them.
  const isAdmin = isAdminEmail(user.email ?? undefined) || profile?.is_admin === true;
  const isUnlimited = isAdmin || profile?.tier === "unlimited";
  const tier = isUnlimited ? "unlimited" : profile?.tier ?? "free";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          How you appear across Corelyx.
        </p>
      </div>

      <div className="rounded-xl border glass-card p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-bold text-foreground border border-border shrink-0"
            style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!profile?.avatar_url && (profile?.display_name || user.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {profile?.display_name || user.email?.split("@")[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <span className="ml-auto inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wider">
            {isUnlimited ? "Unlimited" : tier}
          </span>
        </div>

        <div className="border-t border-border/60 pt-6">
          <ProfileForm
            initialDisplayName={profile?.display_name ?? ""}
            initialAvatarUrl={profile?.avatar_url ?? ""}
          />
        </div>
      </div>

      <div className="rounded-xl border glass-card p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Plan</p>
            <h2 className="mt-2 text-sm font-semibold capitalize">
              {isUnlimited ? "Unlimited plan" : `${tier} plan`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isUnlimited
                ? "Full access to every feature — nothing to upgrade."
                : "Buy a new plan or compare limits for your automations."}
            </p>
          </div>
          {!isUnlimited && (
            <Link
              href="/plan"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Upgrade Plan
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-xl border glass-card p-6 space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Account</p>
        <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="font-mono text-xs break-all">{user.email}</span>

          <span className="text-muted-foreground">User ID</span>
          <span className="font-mono text-xs break-all">{user.id}</span>

          <span className="text-muted-foreground">Joined</span>
          <span className="font-mono text-xs">{new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

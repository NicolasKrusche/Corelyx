"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, Clock, Loader2, Mail, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type InviteInfo = {
  org_id: string;
  org_name?: string;
  email: string;
  role: string;
  expires_at: string;
};

type Status = "loading" | "ready" | "accepting" | "success" | "error" | "expired" | "wrong-email" | "already-member";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!params.token) return;

    // Fetch invite details using the service client via API
    fetch(`/api/orgs/invite/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 410 || body?.error?.includes("expired")) {
            setStatus("expired");
          } else {
            setStatus("error");
            setErrorMessage(body?.error ?? "Invalid invitation.");
          }
          return;
        }
        const data = await res.json();
        setInvite(data.invite);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("Failed to load invitation details.");
      });
  }, [params.token]);

  const handleAccept = useCallback(async () => {
    if (!params.token) return;
    setStatus("accepting");

    try {
      const res = await fetch(`/api/orgs/invite/${params.token}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.error?.includes("already been accepted") || body?.error?.includes("already a member")) {
          setStatus("already-member");
        } else if (body?.error?.includes("expired")) {
          setStatus("expired");
        } else if (body?.error?.includes("different email")) {
          setStatus("wrong-email");
        } else {
          setStatus("error");
          setErrorMessage(body?.error ?? "Failed to accept invitation.");
        }
        return;
      }

      setStatus("success");
      // Redirect to org settings after a short delay
      setTimeout(() => {
        router.push("/org/settings");
      }, 2000);
    } catch {
      setStatus("error");
      setErrorMessage("An unexpected error occurred.");
    }
  }, [params.token, router]);

  const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer",
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Organization Invitation</h1>
            <p className="text-sm text-muted-foreground">You&apos;ve been invited to join a team.</p>
          </div>
        </div>

        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invitation details…
          </div>
        )}

        {status === "ready" && invite && (
          <>
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Organization</span>
                <span className="text-sm font-medium">{invite.org_name ?? "Unknown"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invited as</span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {ROLE_LABELS[invite.role] ?? invite.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm">{invite.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Expires</span>
                <span className="flex items-center gap-1 text-sm">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(invite.expires_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <button
              onClick={handleAccept}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Accept Invitation
            </button>
          </>
        )}

        {status === "accepting" && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Joining organization…
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Welcome to the organization!
            </p>
            <p className="text-xs text-muted-foreground">
              Redirecting you to organization settings…
            </p>
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-3 text-center">
            <Clock className="mx-auto h-12 w-12 text-amber-500" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              This invitation has expired.
            </p>
            <p className="text-xs text-muted-foreground">
              Please ask the organization admin to send a new invitation.
            </p>
          </div>
        )}

        {status === "wrong-email" && (
          <div className="space-y-3 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              This invitation was sent to a different email address.
            </p>
            <p className="text-xs text-muted-foreground">
              Please log in with the email address that received the invitation.
            </p>
          </div>
        )}

        {status === "already-member" && (
          <div className="space-y-3 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-blue-500" />
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              You&apos;re already a member of this organization.
            </p>
            <button
              onClick={() => router.push("/org/settings")}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Go to Organization Settings →
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {errorMessage || "Something went wrong."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const DEFAULT_AUTH_NEXT = "/dashboard";

function appOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "";
}

export function authCallbackUrl(next = DEFAULT_AUTH_NEXT) {
  const callback = new URL("/auth/callback", appOrigin());
  if (next !== DEFAULT_AUTH_NEXT) callback.searchParams.set("next", next);
  return callback.toString();
}

export async function completePostLoginSetup() {
  const response = await fetch("/api/auth/post-login", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("post_login_setup_failed");
  }
}

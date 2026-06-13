// These server-to-server entrypoints authenticate inside their route handlers.
// They must reach those handlers without a browser session so signature, token,
// and replay checks can run before any workflow is dispatched.
export function isSessionExemptApiRoute(pathname: string): boolean {
  return pathname === "/api/billing/webhook"
    || pathname === "/api/inngest"
    || pathname.startsWith("/api/webhooks/")
    || pathname.startsWith("/api/triggers/webhook/");
}

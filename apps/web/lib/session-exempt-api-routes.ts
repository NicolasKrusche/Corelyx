// These server-to-server entrypoints authenticate inside their route handlers.
// They must reach those handlers without a browser session so signature, token,
// and replay checks can run before any workflow is dispatched.
export function isSessionExemptApiRoute(pathname: string): boolean {
  return pathname === "/api/billing/webhook"
    || pathname === "/api/inngest"
    || pathname.startsWith("/api/webhooks/")
    || pathname.startsWith("/api/triggers/webhook/")
    // The desktop Bridge authenticates with a device token (Bearer crlxdev_…)
    // inside each handler — it has no browser session. crlxdev_ tokens don't match
    // the personal-token (crlx_) shape, so without this they'd hit the session
    // check and 401 before the handler's device-token auth could run.
    || pathname.startsWith("/api/bridge/");
}

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
    || pathname.startsWith("/api/bridge/")
    // The Corelyx Mobile app has no browser cookies. Its bootstrap route
    // (/api/mobile/register) verifies a Supabase access-token bearer in-handler;
    // its other mobile routes authenticate a crlxmob_ device token in-handler.
    // (crlxmob_ tokens presented on general /api/* routes are resolved earlier in
    // middleware to x-token-user-id; this exemption covers the bootstrap case.)
    || pathname.startsWith("/api/mobile/");
}

import "server-only";

/**
 * Whether a non-dedicated "dev" secret may stand in for a dedicated signing
 * secret (e.g. reusing INTERNAL_SERVICE_AUTH_SECRET when a per-purpose secret
 * is unset).
 *
 * FAIL-CLOSED: the fallback is allowed ONLY when the environment is EXPLICITLY
 * development or test. A production marker — or an unrecognized/unset
 * environment — disables it. This is the safe default: a misconfigured deploy
 * that forgets to set the env markers is treated as production and refuses to
 * sign with a shared secret, instead of silently downgrading.
 *
 * Note on Vercel: NODE_ENV is "production" for BOTH preview and production
 * deployments (only `next dev` sets "development"), so internet-reachable
 * preview builds also correctly refuse the fallback.
 */
// Environment markers this codebase uses for non-production: NODE_ENV is
// "development"/"test", RUNTIME_ENV is "local". Anything else (production,
// preview, staging, or unset) is treated as production → no fallback.
const DEV_MARKERS = new Set(["development", "dev", "local", "test"]);

export function allowsDevSecretFallback(): boolean {
  const markers = [
    process.env.NODE_ENV,
    process.env.VERCEL_ENV,
    process.env.APP_ENV,
    process.env.RUNTIME_ENV,
  ];
  if (markers.some((value) => value === "production")) return false;
  return markers.some((value) => value !== undefined && DEV_MARKERS.has(value));
}

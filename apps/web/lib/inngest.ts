import { Inngest } from "inngest";

/**
 * Shared Inngest client.
 * INNGEST_EVENT_KEY is optional in dev (Inngest Dev Server auto-connects).
 * INNGEST_SIGNING_KEY is required in production.
 */
const productionEnvNames = ["NODE_ENV", "VERCEL_ENV", "APP_ENV"] as const;
const isProductionEnvironment = productionEnvNames.some(
  (name) => process.env[name] === "production"
);
const signingKey = process.env.INNGEST_SIGNING_KEY?.trim() || undefined;
const signingKeyFallback =
  process.env.INNGEST_SIGNING_KEY_FALLBACK?.trim() || undefined;

if (isProductionEnvironment && !signingKey) {
  throw new Error(
    "INNGEST_SIGNING_KEY is required in production for Inngest request verification"
  );
}

export const inngest = new Inngest({
  id: "nexflow",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey,
  signingKeyFallback,
});

// ─── Event type map ───────────────────────────────────────────────────────────

export type NexflowEvents = {
  "nexflow/trigger.cron.tick": { data: Record<string, never> };
  "nexflow/trigger.program.complete": {
    data: { program_id: string; run_id: string; user_id: string };
  };
  "nexflow/trigger.webhook": {
    data: { trigger_id: string; token: string; payload: Record<string, unknown> };
  };
};

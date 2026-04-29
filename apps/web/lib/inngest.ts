import { Inngest } from "inngest";

/**
 * Shared Inngest client.
 * INNGEST_EVENT_KEY is optional in dev (Inngest Dev Server auto-connects).
 * INNGEST_SIGNING_KEY is required in production.
 */
const signingKey = process.env.INNGEST_SIGNING_KEY?.trim() || undefined;
const signingKeyFallback =
  process.env.INNGEST_SIGNING_KEY_FALLBACK?.trim() || undefined;

export const inngest = new Inngest({
  id: "corelyx",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey,
  signingKeyFallback,
});

// ─── Event type map ───────────────────────────────────────────────────────────

export type CorelyxEvents = {
  "corelyx/trigger.cron.tick": { data: Record<string, never> };
  "corelyx/trigger.program.complete": {
    data: { program_id: string; run_id: string; user_id: string };
  };
  "corelyx/trigger.webhook": {
    data: { trigger_id: string; token: string; payload: Record<string, unknown> };
  };
};

import { cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { sweepDueCronTriggers } from "@/lib/cron-sweep";

/**
 * Inngest function: runs every minute and fires all due cron triggers.
 *
 * This is the secondary scheduler — the Python runtime's 60s heartbeat
 * (POST /api/internal/cron/tick) is the primary path, because it works even
 * when Inngest is not configured. Both call the same sweep, and each trigger
 * is claimed atomically, so concurrent ticks never double-fire.
 */
export const cronRunner = inngest.createFunction(
  { id: "cron-runner", name: "Cron Trigger Runner", triggers: cron("* * * * *") },
  async ({ step, logger }) => {
    return await step.run("sweep", () => sweepDueCronTriggers(logger));
  }
);

import { NonRetriableError, cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";
import { renewGmailWatchesForActiveTriggers } from "@/lib/triggers/gmail-watch";

/**
 * Inngest function: periodically (re)registers Gmail push-notification watches
 * for every Gmail connection backing an active Gmail event trigger.
 *
 * Gmail watches expire after 7 days, so without renewal a workflow silently
 * stops receiving emails. Running every 6 hours with a 24h refresh-ahead window
 * guarantees a healthy watch even if an individual run is missed, and it also
 * registers watches that were never set up in the first place.
 */
export const gmailWatchRenewer = inngest.createFunction(
  { id: "gmail-watch-renewer", name: "Gmail Watch Renewer", triggers: cron("0 */6 * * *") },
  async ({ step, logger }) => {
    const summary = await step.run("renew-gmail-watches", async () => {
      const db = createServiceClient();
      try {
        return await renewGmailWatchesForActiveTriggers(db);
      } catch (err) {
        throw new NonRetriableError(
          err instanceof Error ? err.message : "Failed to renew Gmail watches"
        );
      }
    });

    logger.info(
      `Gmail watch renewer: checked ${summary.checked}, refreshed ${summary.refreshed}, failed ${summary.failed}`
    );
    return summary;
  }
);

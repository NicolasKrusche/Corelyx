import { createServiceClient } from "@/lib/api";

const DEFAULT_DELIVERY_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function markWebhookDelivery(
  source: string,
  deliveryId: string,
  ttlSeconds = DEFAULT_DELIVERY_TTL_SECONDS
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const { error } = await createServiceClient()
    .from("webhook_deliveries")
    .insert({
      source,
      delivery_id: deliveryId,
      expires_at: expiresAt,
    } as unknown as never);

  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error("Failed to record webhook delivery");
}

/**
 * Release a delivery mark after processing FAILED transiently (runtime
 * unreachable, run row not created). The mark is written before dispatch so
 * concurrent duplicates can't double-process; without this release, a sender
 * retrying the identical signed request would be told "duplicate" and the
 * event would be lost forever. Best-effort: an error here only means a retry
 * of that exact delivery is treated as a duplicate.
 */
export async function releaseWebhookDelivery(source: string, deliveryId: string): Promise<void> {
  try {
    await createServiceClient()
      .from("webhook_deliveries")
      .delete()
      .eq("source", source)
      .eq("delivery_id", deliveryId);
  } catch {
    // best-effort
  }
}

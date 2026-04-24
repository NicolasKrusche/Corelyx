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

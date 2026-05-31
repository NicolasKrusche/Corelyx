import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { dispatchEventTriggers } from "@/lib/triggers/dispatch-event";
import { getValidOAuthToken } from "@/lib/oauth-token";
import { verifyGooglePubSubOidc } from "@/lib/pubsub-auth";
import { markWebhookDelivery } from "@/lib/webhook-deliveries";
import { readBoundedJsonBody } from "@/lib/request-body";
import { enforcePublicEndpointRateLimit } from "@/lib/public-rate-limit";
import { serverLog } from "@/lib/server-log";
import { shouldDispatchGmailMessage, type GmailHistoryDelta } from "@/lib/gmail-history-delta";

type GmailConnectionRow = {
  id: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
};

type PubSubEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
};

type GmailPushPayload = {
  emailAddress?: string;
  historyId?: string;
};

export async function POST(request: Request) {
  const limited = await enforcePublicEndpointRateLimit(request, "gmail");
  if (limited) return limited;

  const audience = process.env.PUBSUB_GMAIL_WEBHOOK_AUDIENCE;
  if (!audience) {
    serverLog({ level: "error", event: "webhooks.gmail.missing_config", message: "PUBSUB_GMAIL_WEBHOOK_AUDIENCE env var is not set." });
    return apiError("Webhook not configured", 500);
  }

  const serviceAccountEmail = process.env.PUBSUB_GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL;
  if (!serviceAccountEmail) {
    serverLog({ level: "error", event: "webhooks.gmail.missing_config", message: "PUBSUB_GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL env var is not set." });
    return apiError("Webhook not configured", 500);
  }

  const isValid = await verifyGooglePubSubOidc(
    request.headers.get("authorization"),
    { audience, serviceAccountEmail }
  );
  if (!isValid) return apiError("Unauthorized", 401);

  let envelope: PubSubEnvelope;
  const boundedBody = await readBoundedJsonBody<PubSubEnvelope>(request);
  if (!boundedBody.ok) return boundedBody.response;
  envelope = boundedBody.value;

  const messageId = envelope.message?.messageId;
  if (!messageId) return apiError("Missing Pub/Sub messageId", 400);

  const encodedData = envelope.message?.data;
  if (!encodedData) return apiError("Missing Pub/Sub message data", 400);

  let gmailPayload: GmailPushPayload;
  try {
    const decoded = Buffer.from(encodedData, "base64").toString("utf-8");
    gmailPayload = JSON.parse(decoded) as GmailPushPayload;
  } catch {
    return apiError("Invalid Pub/Sub message payload", 400);
  }

  const emailAddress = gmailPayload.emailAddress;
  const historyId = gmailPayload.historyId;
  if (!emailAddress || !historyId) {
    return apiError("Missing emailAddress/historyId in Gmail push payload", 400);
  }

  let isFirstDelivery: boolean;
  try {
    isFirstDelivery = await markWebhookDelivery("gmail", messageId);
  } catch {
    return apiError("Failed to record webhook delivery", 500);
  }
  if (!isFirstDelivery) {
    return NextResponse.json({ ok: true, accepted: true, duplicate: true });
  }

  const db = createServiceClient();
  const { data: rowsRaw, error } = await db
    .from("connections")
    .select("id, user_id, metadata")
    .eq("provider", "gmail")
    .eq("is_valid", true);

  if (error) return apiError(error.message, 500);

  const rows = (rowsRaw ?? []) as unknown as GmailConnectionRow[];
  const targetEmail = emailAddress.toLowerCase();
  const connections = rows.filter(
    (row) =>
      typeof row.metadata?.email === "string" &&
      row.metadata.email.toLowerCase() === targetEmail
  );
  if (connections.length === 0) {
    return NextResponse.json({ ok: true, accepted: true, matched_connections: 0 });
  }

  await Promise.all(
    connections.map(async (connection) => {
      const historyDelta = await _fetchGmailHistoryDelta(connection, historyId, db);
      if (!shouldDispatchGmailMessage(historyDelta)) {
        if (historyDelta.error) {
          serverLog({
            level: "warn",
            event: "webhooks.gmail.empty_history_delta",
            message: "Gmail history delta did not include a new message.",
            details: { connection_id: connection.id, history_error: historyDelta.error },
          });
        }
        return;
      }

      await dispatchEventTriggers({
        source: "gmail",
        event: "message.received",
        payload: {
          email_address: emailAddress,
          history_id: historyId,
          pubsub_message_id: envelope.message?.messageId ?? null,
          pubsub_publish_time: envelope.message?.publishTime ?? null,
          subscription: envelope.subscription ?? null,
          message_id: historyDelta.message_ids[0] ?? null,
          message_ids: historyDelta.message_ids,
          thread_id: historyDelta.thread_ids[0] ?? null,
          thread_ids: historyDelta.thread_ids,
          history_error: historyDelta.error,
          raw: gmailPayload,
        },
        connection_id: connection.id,
        user_id: connection.user_id,
      });
    })
  );

  return NextResponse.json({
    ok: true,
    accepted: true,
    matched_connections: connections.length,
  });
}

async function _fetchGmailHistoryDelta(
  connection: GmailConnectionRow,
  newHistoryId: string,
  db: ReturnType<typeof createServiceClient>
): Promise<GmailHistoryDelta> {
  const metadata = connection.metadata ?? {};
  const gmailWatch = _asRecord(metadata.gmail_watch);
  const previousHistoryId =
    typeof gmailWatch?.history_id === "string" ? gmailWatch.history_id : null;

  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    gmail_watch: {
      ...(gmailWatch ?? {}),
      history_id: newHistoryId,
      updated_at: new Date().toISOString(),
    },
  };

  await db
    .from("connections")
    .update({ metadata: nextMetadata } as never)
    .eq("id", connection.id);

  if (!previousHistoryId || previousHistoryId === newHistoryId) {
    return { message_ids: [], thread_ids: [] };
  }

  try {
    const accessToken = await getValidOAuthToken(db, connection.id);
    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(
        previousHistoryId
      )}&historyTypes=messageAdded&maxResults=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (historyRes.status === 404) {
      return {
        message_ids: [],
        thread_ids: [],
        error: "history_id_expired",
      };
    }
    if (!historyRes.ok) {
      const text = await historyRes.text();
      return {
        message_ids: [],
        thread_ids: [],
        error: `history_fetch_failed:${historyRes.status}:${text.slice(0, 120)}`,
      };
    }

    const historyJson = (await historyRes.json()) as {
      history?: Array<{
        messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>;
      }>;
    };

    const messageIds = new Set<string>();
    const threadIds = new Set<string>();
    for (const item of historyJson.history ?? []) {
      for (const added of item.messagesAdded ?? []) {
        const message = added.message;
        if (!message) continue;
        if (message.id) messageIds.add(message.id);
        if (message.threadId) threadIds.add(message.threadId);
      }
    }

    return {
      message_ids: Array.from(messageIds),
      thread_ids: Array.from(threadIds),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { message_ids: [], thread_ids: [], error: `history_fetch_error:${message}` };
  }
}

function _asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

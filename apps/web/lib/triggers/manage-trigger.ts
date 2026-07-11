import { friendlyResponseMessage } from "@/lib/friendly-errors";

type FetchLike = typeof fetch;

async function failureMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as {
    error?: string | null;
    message?: string | null;
  } | null;
  return friendlyResponseMessage(body, fallback);
}

export async function setTriggerActive<T>(
  programId: string,
  triggerId: string,
  isActive: boolean,
  fetchImpl: FetchLike = fetch
): Promise<T> {
  const response = await fetchImpl(`/api/programs/${programId}/triggers/${triggerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!response.ok) {
    throw new Error(await failureMessage(response, "We could not update this trigger. Please try again."));
  }
  const body = await response.json() as { trigger?: T };
  if (!body.trigger) throw new Error("The trigger was updated, but the response was incomplete. Reload and try again.");
  return body.trigger;
}

export async function removeTrigger(
  programId: string,
  triggerId: string,
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const response = await fetchImpl(`/api/programs/${programId}/triggers/${triggerId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await failureMessage(response, "We could not delete this trigger. Please try again."));
  }
}

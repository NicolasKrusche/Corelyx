import { describe, expect, it } from "vitest";
import {
  buildEventTriggerPayload,
  eventNamesMatch,
  normalizeEventPayload,
} from "@/lib/triggers/dispatch-event";

describe("event trigger payloads", () => {
  it("exposes provider payload fields at the top level and under payload", () => {
    const payload = { message_id: "gmail-message-1", thread_id: "gmail-thread-1" };

    expect(buildEventTriggerPayload({
      triggerId: "trigger-1",
      source: "gmail",
      event: "message.received",
      payload,
      connectionId: "connection-1",
    })).toEqual({
      message_id: "gmail-message-1",
      thread_id: "gmail-thread-1",
      trigger_id: "trigger-1",
      source: "gmail",
      event: "message.received",
      payload,
      connection_id: "connection-1",
    });
  });

  it("does not allow provider payload data to overwrite trusted envelope fields", () => {
    expect(buildEventTriggerPayload({
      triggerId: "trigger-1",
      source: "gmail",
      event: "message.received",
      payload: { source: "forged", event: "forged" },
    })).toMatchObject({
      trigger_id: "trigger-1",
      source: "gmail",
      event: "message.received",
      connection_id: null,
    });
  });

  it("keeps legacy Gmail new_email triggers compatible", () => {
    expect(eventNamesMatch("gmail", "new_email", "message.received")).toBe(true);
    expect(eventNamesMatch("gmail", "another_event", "message.received")).toBe(false);
  });

  it("promotes the first Gmail message id before dispatch", () => {
    expect(normalizeEventPayload("gmail", "message.received", {
      message_ids: ["gmail-message-1", "gmail-message-2"],
    })).toEqual({
      message_id: "gmail-message-1",
      message_ids: ["gmail-message-1", "gmail-message-2"],
    });
  });

  it("rejects impossible Gmail received events before they create runs", () => {
    expect(() => normalizeEventPayload("gmail", "message.received", {}))
      .toThrow("Gmail message.received events require a message_id before dispatch.");
  });
});

import { describe, expect, it } from "vitest";
import { coerceHistoryId, shouldDispatchGmailMessage } from "@/lib/gmail-history-delta";

describe("Gmail history delta dispatch", () => {
  it("does not start a workflow run for an empty Gmail push delta", () => {
    expect(shouldDispatchGmailMessage({ message_ids: [], thread_ids: [] })).toBe(false);
  });

  it("starts a workflow run when Gmail reports a newly added message", () => {
    expect(shouldDispatchGmailMessage({ message_ids: ["message-1"], thread_ids: ["thread-1"] })).toBe(true);
  });
});

describe("coerceHistoryId", () => {
  it("accepts the string historyId returned by the Gmail watch API", () => {
    expect(coerceHistoryId("1234567890")).toBe("1234567890");
  });

  it("normalizes the numeric historyId delivered in Pub/Sub push payloads", () => {
    // Regression: a number persisted into metadata used to read back as null,
    // which silently stopped dispatch on every email after the first.
    expect(coerceHistoryId(1234567890)).toBe("1234567890");
  });

  it("returns null for missing or empty values", () => {
    expect(coerceHistoryId(null)).toBeNull();
    expect(coerceHistoryId(undefined)).toBeNull();
    expect(coerceHistoryId("")).toBeNull();
    expect(coerceHistoryId("   ")).toBeNull();
    expect(coerceHistoryId(Number.NaN)).toBeNull();
  });
});

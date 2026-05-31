import { describe, expect, it } from "vitest";
import { shouldDispatchGmailMessage } from "@/lib/gmail-history-delta";

describe("Gmail history delta dispatch", () => {
  it("does not start a workflow run for an empty Gmail push delta", () => {
    expect(shouldDispatchGmailMessage({ message_ids: [], thread_ids: [] })).toBe(false);
  });

  it("starts a workflow run when Gmail reports a newly added message", () => {
    expect(shouldDispatchGmailMessage({ message_ids: ["message-1"], thread_ids: ["thread-1"] })).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  GMAIL_WATCH_REFRESH_AHEAD_MS,
  buildGmailWatchRequestBody,
  getGmailWatchTopic,
  gmailWatchNeedsRefresh,
} from "@/lib/triggers/gmail-watch";

const NOW = Date.parse("2026-05-31T00:00:00.000Z");

describe("gmailWatchNeedsRefresh", () => {
  it("needs a refresh when there is no watch at all", () => {
    expect(gmailWatchNeedsRefresh(null, NOW)).toBe(true);
    expect(gmailWatchNeedsRefresh(undefined, NOW)).toBe(true);
  });

  it("needs a refresh when the watch has no historyId or expiration", () => {
    expect(gmailWatchNeedsRefresh({ expiration: new Date(NOW + 7 * 86400_000).toISOString() }, NOW)).toBe(true);
    expect(gmailWatchNeedsRefresh({ history_id: "123" }, NOW)).toBe(true);
  });

  it("does not refresh a healthy watch that is comfortably in the future", () => {
    const expiration = new Date(NOW + 5 * 86400_000).toISOString();
    expect(gmailWatchNeedsRefresh({ history_id: "123", expiration }, NOW)).toBe(false);
  });

  it("accepts a numeric historyId (as persisted from a push payload)", () => {
    const expiration = new Date(NOW + 5 * 86400_000).toISOString();
    expect(gmailWatchNeedsRefresh({ history_id: 123, expiration }, NOW)).toBe(false);
  });

  it("refreshes when inside the refresh-ahead window", () => {
    const expiration = new Date(NOW + GMAIL_WATCH_REFRESH_AHEAD_MS - 1000).toISOString();
    expect(gmailWatchNeedsRefresh({ history_id: "123", expiration }, NOW)).toBe(true);
  });
});

describe("buildGmailWatchRequestBody", () => {
  it("defaults to an INBOX-only include filter so we are not woken for every mailbox change", () => {
    expect(buildGmailWatchRequestBody("projects/p/topics/t")).toEqual({
      topicName: "projects/p/topics/t",
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    });
  });

  it("honours an explicit label override", () => {
    expect(
      buildGmailWatchRequestBody("projects/p/topics/t", {
        labelIds: ["Label_123"],
        labelFilterAction: "include",
      })
    ).toEqual({
      topicName: "projects/p/topics/t",
      labelIds: ["Label_123"],
      labelFilterAction: "include",
    });
  });

  it("falls back to the default when an empty label list is passed", () => {
    expect(buildGmailWatchRequestBody("projects/p/topics/t", { labelIds: [] })).toEqual({
      topicName: "projects/p/topics/t",
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    });
  });
});

describe("getGmailWatchTopic", () => {
  const original = {
    primary: process.env.GMAIL_WATCH_TOPIC,
    fallback: process.env.GOOGLE_GMAIL_WATCH_TOPIC,
  };

  afterEach(() => {
    process.env.GMAIL_WATCH_TOPIC = original.primary;
    process.env.GOOGLE_GMAIL_WATCH_TOPIC = original.fallback;
  });

  it("prefers GMAIL_WATCH_TOPIC then falls back, else null", () => {
    process.env.GMAIL_WATCH_TOPIC = "projects/p/topics/primary";
    expect(getGmailWatchTopic()).toBe("projects/p/topics/primary");

    delete process.env.GMAIL_WATCH_TOPIC;
    process.env.GOOGLE_GMAIL_WATCH_TOPIC = "projects/p/topics/fallback";
    expect(getGmailWatchTopic()).toBe("projects/p/topics/fallback");

    delete process.env.GOOGLE_GMAIL_WATCH_TOPIC;
    expect(getGmailWatchTopic()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  CORELYX_PROVIDER_SLUGS,
  normalizeAppKey,
  RELAY_STEP_MAP,
  RELAY_TRIGGER_MAP,
  resolveRelayApp,
  summarizeCoverage,
} from "@/lib/migrate/relay/mapping";

describe("normalizeAppKey", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normalizeAppKey("Google Sheets")).toBe("googlesheets");
    expect(normalizeAppKey("QuickBooks Online")).toBe("quickbooksonline");
  });

  it("drops a trailing parenthetical", () => {
    expect(normalizeAppKey("Quo (OpenPhone)")).toBe("quo");
    expect(normalizeAppKey("X (Twitter)")).toBe("x");
  });
});

describe("resolveRelayApp", () => {
  it("maps a direct Corelyx slug to a connector", () => {
    const res = resolveRelayApp("trello");
    expect(res).toEqual({ status: "connector", provider: "trello", label: "Trello" });
  });

  it("is case-insensitive and space-tolerant", () => {
    expect(resolveRelayApp("SLACK")).toMatchObject({ status: "connector", provider: "slack" });
    expect(resolveRelayApp("Google Sheets")).toMatchObject({ status: "connector", provider: "sheets" });
  });

  it("resolves renamed/aliased products to the right connector", () => {
    expect(resolveRelayApp("Kit")).toMatchObject({ provider: "convertkit" });
    expect(resolveRelayApp("Quo (OpenPhone)")).toMatchObject({ provider: "openphone" });
    expect(resolveRelayApp("QuickBooks Online")).toMatchObject({ provider: "quickbooks" });
    expect(resolveRelayApp("X (Twitter)")).toMatchObject({ provider: "twitter" });
    expect(resolveRelayApp("Microsoft Outlook Mail")).toMatchObject({ provider: "outlook" });
  });

  it("maps AI model providers to agent nodes, not connectors", () => {
    expect(resolveRelayApp("OpenAI")).toMatchObject({ status: "agent" });
    expect(resolveRelayApp("DeepSeek")).toMatchObject({ status: "agent" });
    expect(resolveRelayApp("Google AI Studio (Gemini)")).toMatchObject({ status: "agent" });
  });

  it("flags known gaps with a suggestion where one exists", () => {
    expect(resolveRelayApp("Attio")).toMatchObject({ status: "gap", suggestion: "hubspot" });
    expect(resolveRelayApp("Microsoft Excel")).toMatchObject({ status: "gap", suggestion: "sheets" });
    expect(resolveRelayApp("Snowflake")).toMatchObject({ status: "gap" });
  });

  it("treats an unknown but non-empty app as a gap (never silently drops)", () => {
    expect(resolveRelayApp("Wingtip Widgets")).toMatchObject({ status: "gap", label: "Wingtip Widgets" });
  });

  it("returns null only for empty/blank input", () => {
    expect(resolveRelayApp("")).toBeNull();
    expect(resolveRelayApp("   ")).toBeNull();
    // @ts-expect-error — guarding runtime callers that pass non-strings.
    expect(resolveRelayApp(null)).toBeNull();
  });
});

describe("trigger + step maps", () => {
  it("maps Relay triggers to Corelyx trigger types", () => {
    expect(RELAY_TRIGGER_MAP.scheduled).toBe("cron");
    expect(RELAY_TRIGGER_MAP.mailhook).toBe("webhook");
    expect(RELAY_TRIGGER_MAP.rss).toBe("cron");
    expect(RELAY_TRIGGER_MAP.manual).toBe("manual");
  });

  it("maps Relay steps to Corelyx logic types", () => {
    expect(RELAY_STEP_MAP.paths).toBe("branch");
    expect(RELAY_STEP_MAP.iterator).toBe("loop");
    expect(RELAY_STEP_MAP.wait).toBe("delay");
  });
});

describe("summarizeCoverage", () => {
  it("splits covered from gaps and dedupes by label", () => {
    const summary = summarizeCoverage([
      resolveRelayApp("Gmail"),
      resolveRelayApp("Gmail"), // duplicate
      resolveRelayApp("OpenAI"),
      resolveRelayApp("Attio"),
      null,
    ]);
    expect(summary.covered).toHaveLength(2); // Gmail (connector) + OpenAI (agent)
    expect(summary.gaps).toHaveLength(1); // Attio
    expect(summary.gaps[0]).toMatchObject({ label: "Attio" });
  });
});

describe("CORELYX_PROVIDER_SLUGS", () => {
  it("contains the expected connector count and key providers", () => {
    expect(CORELYX_PROVIDER_SLUGS.size).toBe(203);
    for (const slug of ["gmail", "slack", "notion", "sheets", "hubspot", "salesforce"]) {
      expect(CORELYX_PROVIDER_SLUGS.has(slug)).toBe(true);
    }
  });
});

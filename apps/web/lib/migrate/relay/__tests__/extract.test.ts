import { describe, expect, it } from "vitest";
import {
  extractRelayWorkflowPreview,
  previewFromJsonString,
} from "@/lib/migrate/relay/extract";

// A plausible (invented) Relay export shape — we've never seen a real one, so
// the extractor must lean on generic key patterns, not exact field names.
const SAMPLE = {
  name: "Weekday invoice digest",
  trigger: { type: "scheduled", schedule: "0 7 * * 1-5", timezone: "Europe/Berlin" },
  steps: [
    { id: "s1", app: "Gmail", action: "search" },
    { id: "s2", type: "gmail.read_email" },
    { id: "s3", app: "OpenAI", action: "classify" },
    { id: "s4", integration: "Slack", action: "send_message" },
    { id: "s5", app: "Notion", action: "create_database_entry" },
    { id: "s6", app: "Attio", action: "create_record" },
  ],
};

describe("extractRelayWorkflowPreview", () => {
  it("reads the workflow name", () => {
    expect(extractRelayWorkflowPreview(SAMPLE).name).toBe("Weekday invoice digest");
  });

  it("counts steps from the largest object array", () => {
    expect(extractRelayWorkflowPreview(SAMPLE).stepCount).toBe(6);
  });

  it("detects apps under app-ish keys and inside type strings", () => {
    const preview = extractRelayWorkflowPreview(SAMPLE);
    const labels = preview.apps.map((a) => a.resolution.label);
    expect(labels).toContain("Gmail"); // both the app key and the gmail.* type
    expect(labels).toContain("Slack");
    expect(labels).toContain("Notion");
    expect(labels).toContain("OpenAI");
    expect(labels).toContain("Attio");
  });

  it("classifies detected apps into connector / agent / gap", () => {
    const preview = extractRelayWorkflowPreview(SAMPLE);
    const byLabel = Object.fromEntries(preview.apps.map((a) => [a.resolution.label, a.resolution.status]));
    expect(byLabel["Gmail"]).toBe("connector");
    expect(byLabel["OpenAI"]).toBe("agent");
    expect(byLabel["Attio"]).toBe("gap");
  });

  it("surfaces connector providers for prompt grounding", () => {
    const preview = extractRelayWorkflowPreview(SAMPLE);
    expect(preview.providers).toEqual(expect.arrayContaining(["gmail", "slack", "notion"]));
    // Agent (OpenAI) and gap (Attio) are not connector providers.
    expect(preview.providers).not.toContain("openai");
    expect(preview.providers).not.toContain("attio");
  });

  it("maps the trigger type to a Corelyx trigger_type", () => {
    expect(extractRelayWorkflowPreview(SAMPLE).triggerTypes).toContain("cron");
  });

  it("falls back to the provided name when none is found", () => {
    expect(extractRelayWorkflowPreview({ steps: [] }, "folder-name").name).toBe("folder-name");
  });

  it("never throws on hostile / weird input", () => {
    for (const bad of [null, undefined, 42, "string", [], {}, { a: { b: { c: [1, 2, 3] } } }]) {
      expect(() => extractRelayWorkflowPreview(bad)).not.toThrow();
    }
  });

  it("does not inflate step count from a string array named like a step key", () => {
    // "items" of plain strings shouldn't count as steps.
    const preview = extractRelayWorkflowPreview({ name: "x", items: ["a", "b", "c"] });
    expect(preview.stepCount).toBe(0);
  });
});

describe("previewFromJsonString", () => {
  it("parses a raw JSON string", () => {
    const preview = previewFromJsonString(JSON.stringify(SAMPLE));
    expect(preview?.name).toBe("Weekday invoice digest");
  });

  it("tolerates markdown code fences", () => {
    const preview = previewFromJsonString("```json\n" + JSON.stringify(SAMPLE) + "\n```");
    expect(preview?.stepCount).toBe(6);
  });

  it("returns null when no JSON object can be recovered", () => {
    expect(previewFromJsonString("not json at all")).toBeNull();
    expect(previewFromJsonString("")).toBeNull();
  });
});

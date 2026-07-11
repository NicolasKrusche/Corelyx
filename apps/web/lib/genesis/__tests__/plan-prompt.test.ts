import { describe, expect, it } from "vitest";
import { buildPlanSystemPrompt, buildProviderStubSection } from "../plan-prompt";

describe("buildProviderStubSection", () => {
  it("lists only the selected providers", () => {
    const section = buildProviderStubSection(["gmail"]);
    expect(section).toContain("GMAIL:");
    expect(section).not.toContain("SLACK:");
    expect(section).not.toContain("NOTION:");
  });

  it("falls back to all tier-1 providers when none are selected", () => {
    const section = buildProviderStubSection(null);
    expect(section).toContain("GMAIL:");
    expect(section).toContain("SLACK:");
    expect(section).toContain("NOTION:");
    expect(section).toContain("OUTLOOK:");
  });

  it("keeps each provider stub to a single line (no params/output-shape detail)", () => {
    const section = buildProviderStubSection(["gmail"]);
    const gmailLine = section.split("\n").find((l) => l.startsWith("GMAIL:"));
    expect(gmailLine).toBeDefined();
    expect(gmailLine).not.toContain("→ output:");
    expect(gmailLine).not.toContain("REQUIRED");
  });
});

describe("buildPlanSystemPrompt", () => {
  it("never includes full connector operation docs", () => {
    const prompt = buildPlanSystemPrompt(["gmail", "slack"]);
    expect(prompt).not.toContain("OPERATION REFERENCE");
    expect(prompt).not.toContain("GAP REFERENCE");
    expect(prompt).not.toContain("→ output:");
  });

  it("instructs the model to emit pending connection-node placeholders", () => {
    const prompt = buildPlanSystemPrompt(["gmail"]);
    expect(prompt).toContain('"connector_type":"pending"');
    expect(prompt).toContain("do NOT invent an operation or params here");
  });

  it("still documents trigger/agent/step node shapes in full", () => {
    const prompt = buildPlanSystemPrompt(null);
    expect(prompt).toContain('"trigger_type":"cron"');
    expect(prompt).toContain("AGENT NODE");
    expect(prompt).toContain("data['n1'].get");
  });

  it("includes clarifications only when explicitly allowed", () => {
    const withQuestions = buildPlanSystemPrompt(null, null, null, { allowClarifications: true });
    const without = buildPlanSystemPrompt(null, null);
    expect(withQuestions).toContain("clarifications");
    expect(without.toLowerCase()).not.toContain("clarifications");
  });

  it("includes live capability data when provided, with guidance on using it", () => {
    const withCapabilities = buildPlanSystemPrompt(["slack"], null, "LIVE CONNECTION CAPABILITIES:\n  - channel: [SLACK_CHANNEL_1]");
    const without = buildPlanSystemPrompt(["slack"]);
    expect(withCapabilities).toContain("[SLACK_CHANNEL_1]");
    expect(withCapabilities).toContain("copy it verbatim including brackets");
    expect(without).not.toContain("LIVE CONNECTION CAPABILITIES");
    expect(without).not.toContain("copy it verbatim including brackets");
  });

  it("narrows INSUFFICIENT_DESCRIPTION to genuinely empty requests", () => {
    const prompt = buildPlanSystemPrompt(["gmail"]);
    expect(prompt).toContain("ONLY for a request with no identifiable trigger AND no identifiable action");
    expect(prompt).toContain("almost every description is plannable");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRelayConversionAddendum,
  buildRelayConversionUserMessage,
  buildRelayRepairUserMessage,
  capJsonForPrompt,
} from "@/lib/migrate/relay/prompt";

describe("buildRelayConversionAddendum", () => {
  it("declares migration mode and the review invariant", () => {
    const addendum = buildRelayConversionAddendum();
    expect(addendum).toContain("RELAY.APP MIGRATION MODE");
    expect(addendum).toContain("is_active to false");
    expect(addendum).toContain("note node"); // unmapped steps become notes
    expect(addendum).toContain("Do NOT invent credentials");
  });

  it("includes the concept map (e.g. paths → branch)", () => {
    const addendum = buildRelayConversionAddendum();
    expect(addendum.toLowerCase()).toContain("logic_type:branch");
    expect(addendum.toLowerCase()).toContain("logic_type:loop");
  });
});

describe("capJsonForPrompt", () => {
  it("omits bulky fields", () => {
    const out = capJsonForPrompt({ subject: "hi", body_html: "<div>".repeat(10_000), attachments: [1, 2, 3] });
    expect(out).toContain("subject");
    expect(out).toContain("omitted");
    expect(out).not.toContain("<div><div>");
  });

  it("truncates long strings", () => {
    const out = capJsonForPrompt({ note: "x".repeat(5_000) });
    expect(out).toContain("truncated");
    expect(out.length).toBeLessThan(2_000);
  });

  it("caps very long arrays", () => {
    const out = capJsonForPrompt({ rows: Array.from({ length: 500 }, (_, i) => ({ i })) });
    expect(out).toContain("more items omitted");
  });

  it("hard-caps the total length", () => {
    const huge = { list: Array.from({ length: 50 }, (_, i) => ({ label: "y".repeat(400), i })) };
    const out = capJsonForPrompt(huge, 1_000);
    expect(out.length).toBeLessThanOrEqual(1_100);
  });

  it("accepts a raw JSON string and a fenced string", () => {
    expect(capJsonForPrompt('{"a":1}')).toContain("\"a\"");
    expect(capJsonForPrompt('```json\n{"a":1}\n```')).toContain("\"a\"");
  });

  it("returns non-JSON text length-capped rather than throwing", () => {
    expect(capJsonForPrompt("just some text", 5)).toContain("truncated");
  });
});

describe("buildRelayConversionUserMessage", () => {
  it("embeds the build prompt and the workflow JSON", () => {
    const msg = buildRelayConversionUserMessage({
      name: "Digest",
      buildPrompt: "Every weekday at 7am, summarize invoices to Slack.",
      workflowJson: { trigger: { type: "scheduled" }, steps: [{ app: "Slack" }] },
    });
    expect(msg).toContain("Source workflow name: Digest");
    expect(msg).toContain("RELAY BUILD PROMPT");
    expect(msg).toContain("summarize invoices");
    expect(msg).toContain("RELAY WORKFLOW JSON");
    expect(msg).toContain("Return ONLY the Corelyx program JSON object");
  });

  it("works with only a build prompt (no JSON)", () => {
    const msg = buildRelayConversionUserMessage({ buildPrompt: "Do a thing." });
    expect(msg).toContain("Do a thing.");
    expect(msg).not.toContain("RELAY WORKFLOW JSON");
  });

  it("works with only JSON (no build prompt)", () => {
    const msg = buildRelayConversionUserMessage({ workflowJson: { steps: [] } });
    expect(msg).toContain("RELAY WORKFLOW JSON");
    expect(msg).not.toContain("RELAY BUILD PROMPT");
  });

  it("notes when no source material is provided", () => {
    const msg = buildRelayConversionUserMessage({});
    expect(msg).toContain("No source material");
  });
});

describe("buildRelayRepairUserMessage", () => {
  it("includes the error and the previous output", () => {
    const msg = buildRelayRepairUserMessage('{"broken":true}', "nodes.0.config: invalid cron");
    expect(msg).toContain("invalid cron");
    expect(msg).toContain('{"broken":true}');
    expect(msg).toContain("corrected");
  });
});

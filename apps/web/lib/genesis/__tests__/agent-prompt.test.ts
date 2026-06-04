import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt, buildAgentUserMessage } from "../prompt";
import {
  AGENT_TOOLS,
  AGENT_TOOL_IDS,
  buildAgentToolReference,
  isAgentToolId,
  isDestructiveAgentTool,
} from "../agent-tools";

describe("agent tool registry", () => {
  it("has unique, namespaced ids", () => {
    const ids = AGENT_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("corelyx.")).toBe(true);
  });

  it("marks create/update as destructive write tools", () => {
    expect(isDestructiveAgentTool("corelyx.create_workflow")).toBe(true);
    expect(isDestructiveAgentTool("corelyx.update_program")).toBe(true);
    expect(isDestructiveAgentTool("corelyx.list_programs")).toBe(false);
  });

  it("every destructive tool is also a write tool", () => {
    for (const tool of AGENT_TOOLS) {
      if (tool.destructive) expect(tool.scope).toBe("write");
    }
  });

  it("recognises known ids and rejects unknown ones", () => {
    expect(isAgentToolId("corelyx.list_runs")).toBe(true);
    expect(isAgentToolId("corelyx.delete_everything")).toBe(false);
  });
});

describe("buildAgentSystemPrompt", () => {
  const prompt = buildAgentSystemPrompt(["gmail", "slack"]);

  it("declares the agent program type and one-time framing", () => {
    expect(prompt).toContain('program_type:"agent"');
    expect(prompt).toContain("runs ONCE");
  });

  it("documents the agent_task node and its bounded loop", () => {
    expect(prompt).toContain("AGENT_TASK NODE");
    expect(prompt).toContain("max_iterations");
  });

  it("forces a single manual trigger (no schedules/events)", () => {
    expect(prompt).toContain('"trigger_type":"manual"');
    expect(prompt.toLowerCase()).toContain("not scheduled");
  });

  it("lists every account tool id so the model only emits real tools", () => {
    const reference = buildAgentToolReference();
    expect(prompt).toContain(reference);
    for (const id of AGENT_TOOL_IDS) expect(prompt).toContain(id);
  });

  it("still includes connector operation knowledge", () => {
    expect(prompt).toContain("OPERATION REFERENCE");
    expect(prompt).toContain("GMAIL");
  });
});

describe("buildAgentUserMessage", () => {
  it("wraps the task and lists connections", () => {
    const msg = buildAgentUserMessage("Reconcile last quarter's invoices", [
      { name: "Work Gmail", type: "gmail", scopes: ["read"] },
    ]);
    expect(msg).toContain("<user_input>");
    expect(msg).toContain("Reconcile last quarter's invoices");
    expect(msg).toContain('name: "Work Gmail"');
  });

  it("includes account context when provided", () => {
    const msg = buildAgentUserMessage("Audit my workflows", [], "12 workflows, 3 failing");
    expect(msg).toContain("Account context");
    expect(msg).toContain("12 workflows, 3 failing");
  });
});

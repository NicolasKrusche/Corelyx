import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";
import {
  isJsonObject,
  workflowRequiresPayloadForManualRun,
} from "@/lib/triggers/manual-run";

function schemaWithTrigger(triggerType: string): ProgramSchema {
  return {
    nodes: [{
      id: "trigger-1",
      type: "trigger",
      config: { trigger_type: triggerType },
    }],
  } as unknown as ProgramSchema;
}

describe("manual trigger payloads", () => {
  it("requires payloads for external event tests", () => {
    expect(workflowRequiresPayloadForManualRun(schemaWithTrigger("event"))).toBe(true);
    expect(workflowRequiresPayloadForManualRun(schemaWithTrigger("webhook"))).toBe(true);
    expect(workflowRequiresPayloadForManualRun(schemaWithTrigger("program_output"))).toBe(true);
  });

  it("does not require payloads for manual and scheduled runs", () => {
    expect(workflowRequiresPayloadForManualRun(schemaWithTrigger("manual"))).toBe(false);
    expect(workflowRequiresPayloadForManualRun(schemaWithTrigger("cron"))).toBe(false);
  });

  it("only accepts JSON objects as injected trigger payloads", () => {
    expect(isJsonObject({ message_id: "gmail-message-1" })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("gmail-message-1")).toBe(false);
  });
});

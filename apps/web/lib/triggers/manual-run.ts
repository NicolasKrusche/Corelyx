import type { ProgramSchema } from "@flowos/schema";

export type JsonObject = Record<string, unknown>;

const PAYLOAD_DRIVEN_TRIGGER_TYPES = new Set([
  "event",
  "webhook",
  "program_output",
]);

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function workflowRequiresPayloadForManualRun(schema: ProgramSchema): boolean {
  return schema.nodes.some((node) => {
    if (node.type !== "trigger") return false;
    const config = node.config as unknown as Record<string, unknown>;
    return PAYLOAD_DRIVEN_TRIGGER_TYPES.has(String(config.trigger_type ?? ""));
  });
}

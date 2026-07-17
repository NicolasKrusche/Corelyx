import type { ProgramSchema } from "@flowos/schema";

import { getEntitlements, type Tier } from "@/lib/entitlements";
import {
  getAllowedPlatformModels,
  PLATFORM_DEFAULT_MODEL,
} from "@/lib/genesis/request";

const LEGACY_PLATFORM_MODEL_ALIASES: Record<string, string> = {
  "openai/gpt-oss-120b:free": PLATFORM_DEFAULT_MODEL,
};

export type AgentModelAccessIssue = {
  code: "BYOK_PLAN_REQUIRED" | "PLATFORM_MODEL_PLAN_REQUIRED";
  nodeId: string;
  message: string;
};

export function normalizePlatformModel(model: string): string {
  return LEGACY_PLATFORM_MODEL_ALIASES[model] ?? model;
}

/**
 * Validate the model/key combination against the current workspace plan.
 *
 * This is intentionally separate from schema validation: a workflow can remain
 * editable after a downgrade, but it cannot run until its Agent nodes use a key
 * and Corelyx-platform model available on the current plan.
 */
export function getAgentModelAccessIssue(
  schema: ProgramSchema,
  tier: Tier
): AgentModelAccessIssue | null {
  const entitlements = getEntitlements(tier);
  const allowedPlatformModels = new Set(
    getAllowedPlatformModels(entitlements.genesisPlatformModelTier).map((model) => model.id)
  );

  for (const node of schema.nodes) {
    if (node.type !== "agent" && node.type !== "agent_task") continue;

    const configuredRef = node.config.api_key_ref;
    const apiKeyRef = configuredRef === "__USER_ASSIGNED__" ? "platform" : configuredRef;

    if (apiKeyRef !== "platform") {
      if (!entitlements.byok) {
        return {
          code: "BYOK_PLAN_REQUIRED",
          nodeId: node.id,
          message:
            `Agent node "${node.label}" uses a personal API key. ` +
            "Bring your own API key requires the Solo plan or higher.",
        };
      }
      continue;
    }

    const configuredModel = node.config.model;
    const model = normalizePlatformModel(
      configuredModel === "__USER_ASSIGNED__" ? PLATFORM_DEFAULT_MODEL : configuredModel
    );
    if (!allowedPlatformModels.has(model)) {
      const availableModels = getAllowedPlatformModels(entitlements.genesisPlatformModelTier)
        .map((option) => option.label)
        .join(", ");
      return {
        code: "PLATFORM_MODEL_PLAN_REQUIRED",
        nodeId: node.id,
        message:
          `Model "${model}" is not available for Agent node "${node.label}" ` +
          `with the Corelyx Platform Key on the current plan. Choose ${availableModels} or upgrade your plan.`,
      };
    }
  }

  return null;
}

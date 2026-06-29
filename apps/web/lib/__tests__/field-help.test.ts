import { describe, expect, it } from "vitest";

import { CONNECTOR_OPERATIONS } from "@/lib/connectors/catalog";
import { OPERATION_PARAM_FIELDS } from "@/lib/connectors/operation-params";
import { getFieldHelp, getOperationFieldHelp } from "@/lib/field-help";
import {
  nodeDocFieldUrl,
  nodeDocPathForConnectorOperation,
} from "@/lib/node-doc-paths";
import { getSeoPage } from "@/lib/seo/content";

describe("field help", () => {
  it("covers top-level editable node fields", () => {
    const keys = [
      "label",
      "description",
      "api_key_ref",
      "model",
      "scope_access",
      "system_prompt",
      "requires_approval",
      "approval_timeout_hours",
      "retry.max_attempts",
      "retry.backoff",
      "retry.backoff_base_seconds",
      "retry.fail_program_on_exhaust",
      "trigger_type",
      "expression",
      "timezone",
      "method",
      "source",
      "event",
      "source_program_id",
      "on_status",
      "device_id",
      "path",
      "events",
      "patterns",
      "logic_type",
      "transformation",
      "condition",
      "conditions",
      "conditions[].condition",
      "conditions[].target_node_id",
      "default_branch",
      "operation",
      "operation_params.path",
      "operation_params.content",
      "operation_params.dest",
      "operation_params.pattern",
      "connection",
      "conn_operation",
      "conn_scope_access",
      "scope_required",
      "operation_params_json",
      "http_method",
      "url",
      "auth_type",
      "auth_value",
      "query_params",
      "headers",
      "body",
      "parse_response",
      "timeout_seconds",
      "http_retry",
    ];

    for (const key of keys) {
      const help = getFieldHelp(key);
      expect(help, key).toBeTruthy();
      expect(help?.learnMoreUrl, key).toMatch(/^\/docs\/nodes/);
    }
  });

  it("covers every structured connector operation field", () => {
    for (const [provider, operations] of Object.entries(OPERATION_PARAM_FIELDS)) {
      for (const [operation, fields] of Object.entries(operations)) {
        for (const field of fields) {
          const help = getOperationFieldHelp(provider, operation, field);
          expect(help.title, `${provider}.${operation}.${field.key}`).toBeTruthy();
          expect(help.description, `${provider}.${operation}.${field.key}`).toBeTruthy();
          expect(help.learnMoreUrl, `${provider}.${operation}.${field.key}`).toBe(
            nodeDocFieldUrl(nodeDocPathForConnectorOperation(provider, operation), field.key),
          );
        }
      }
    }
  });

  it("registers docs pages used by field help links", () => {
    const pages = [
      "/docs/nodes",
      "/docs/nodes/common",
      "/docs/nodes/agent",
      "/docs/nodes/agent-task",
      "/docs/nodes/trigger",
      "/docs/nodes/steps",
      "/docs/nodes/steps/transform",
      "/docs/nodes/steps/filter",
      "/docs/nodes/steps/branch",
      "/docs/nodes/steps/delay",
      "/docs/nodes/steps/loop",
      "/docs/nodes/steps/format",
      "/docs/nodes/steps/parse",
      "/docs/nodes/steps/deduplicate",
      "/docs/nodes/steps/sort",
      "/docs/nodes/oauth-connector",
      "/docs/nodes/local-file",
      "/docs/nodes/http-request",
    ];

    for (const page of pages) {
      expect(getSeoPage(page), page).toBeTruthy();
    }
  });

  it("registers a node docs page for every connector operation", () => {
    const providers = new Set([
      ...Object.keys(CONNECTOR_OPERATIONS),
      ...Object.keys(OPERATION_PARAM_FIELDS),
    ]);

    for (const provider of providers) {
      const operations = new Set([
        ...(CONNECTOR_OPERATIONS[provider] ?? []),
        ...Object.keys(OPERATION_PARAM_FIELDS[provider] ?? {}),
      ]);

      for (const operation of operations) {
        const path = nodeDocPathForConnectorOperation(provider, operation);
        expect(getSeoPage(path), path).toBeTruthy();
      }
    }
  });
});

import { describe, expect, it } from "vitest";

import { CONNECTOR_OPERATIONS, OPERATION_SCOPES } from "@/lib/connectors/catalog";
import { OPERATION_PARAM_FIELDS } from "@/lib/connectors/operation-params";

const fieldKeys = (provider: string, operation: string) =>
  (OPERATION_PARAM_FIELDS[provider]?.[operation] ?? []).map((field) => field.key);

describe("connector catalog", () => {
  it("keeps operation, scope, and parameter metadata aligned", () => {
    for (const [provider, operations] of Object.entries(CONNECTOR_OPERATIONS)) {
      expect(new Set(operations).size, `${provider} has duplicate operations`).toBe(operations.length);
      expect(OPERATION_SCOPES[provider], `${provider} is missing scopes`).toBeDefined();
      expect(OPERATION_PARAM_FIELDS[provider], `${provider} is missing param metadata`).toBeDefined();

      for (const operation of operations) {
        expect(OPERATION_SCOPES[provider][operation], `${provider}.${operation} is missing scopes`).toBeDefined();
        expect(OPERATION_PARAM_FIELDS[provider][operation], `${provider}.${operation} is missing param metadata`).toBeDefined();
      }
    }
  });

  it("does not expose scoped operations that are absent from the sidebar catalog", () => {
    for (const [provider, scopes] of Object.entries(OPERATION_SCOPES)) {
      const operations = new Set(CONNECTOR_OPERATIONS[provider] ?? []);
      for (const operation of Object.keys(scopes)) {
        expect(operations.has(operation), `${provider}.${operation} has scopes but is not selectable`).toBe(true);
      }
    }
  });

  it("uses canonical runtime operation names for known connector edge cases", () => {
    expect(CONNECTOR_OPERATIONS.typeform).toContain("get_responses");
    expect(CONNECTOR_OPERATIONS.typeform).not.toContain("list_responses");
    expect(fieldKeys("typeform", "get_responses")).toContain("form_id");

    expect(CONNECTOR_OPERATIONS.drive).toEqual([
      "list_files",
      "get_file",
      "get_file_metadata",
      "upload_file",
      "create_folder",
      "move_file",
      "share_file",
      "delete_file",
    ]);

    expect(fieldKeys("github", "get_pr_diff")).toContain("pr_number");
    expect(fieldKeys("github", "get_pr_diff")).not.toContain("pull_number");

    expect(fieldKeys("docs", "append_text")).toContain("text");
    expect(fieldKeys("docs", "append_to_document")).toContain("text");
    expect(fieldKeys("docs", "replace_text")).toEqual(["document_id", "find", "replace", "match_case"]);

    expect(fieldKeys("hubspot", "create_contact")).toContain("email");
    expect(fieldKeys("hubspot", "create_deal")).toContain("deal_name");
    expect(fieldKeys("asana", "create_task")).toContain("project_id");
    expect(fieldKeys("outlook", "reply_email")).toContain("body");
  });
});

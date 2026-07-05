import { describe, expect, it } from "vitest";

import { PseudonymizationSession } from "@/lib/privacy/pii";
import {
  buildCapabilitySection,
  summarizeCapabilities,
  type CapabilityDescriptor,
} from "../introspection";
import type { GenesisConnectionRow } from "../request";

const connections: GenesisConnectionRow[] = [
  { id: "c-gmail", name: "My Gmail", provider: "gmail", scopes: ["gmail.readonly"] },
  { id: "c-notion", name: "Team Notion", provider: "notion", scopes: null },
];

const descriptors: CapabilityDescriptor[] = [
  {
    provider: "gmail",
    connection_id: "c-gmail",
    resources: [
      { kind: "label", name: "INBOX", user_named: false },
      { kind: "label", name: "Kundenrechnungen 2026", user_named: true },
    ],
  },
  {
    provider: "notion",
    connection_id: "c-notion",
    resources: [
      {
        kind: "database",
        name: "CRM Leads",
        user_named: true,
        properties: [
          { name: "Deal Status", type: "select", options: ["Qualified", "Won"] },
          { name: "Contact Email", type: "email" },
        ],
      },
    ],
    truncated: true,
  },
];

describe("buildCapabilitySection", () => {
  it("never puts user-named strings into the prompt text", () => {
    const session = new PseudonymizationSession();
    const section = buildCapabilitySection(descriptors, connections, session);

    expect(section).toBeTruthy();
    // Every user-created name must be pseudonymized.
    expect(section).not.toContain("Kundenrechnungen 2026");
    expect(section).not.toContain("CRM Leads");
    expect(section).not.toContain("Deal Status");
    expect(section).not.toContain("Contact Email");
    expect(section).not.toContain("Qualified");
    // Placeholders and structural data are what the model sees.
    expect(section).toContain("[GMAIL_LABEL_1]");
    expect(section).toContain("[NOTION_DATABASE_1]");
    expect(section).toContain("[NOTION_PROPERTY_1]");
    expect(section).toContain("[NOTION_OPTION_1]");
    expect(section).toContain("select");
    // Provider-universal system labels stay readable.
    expect(section).toContain("INBOX");
    // Granted scopes come from the connection row.
    expect(section).toContain("gmail.readonly");
    // Truncation is surfaced so the model knows the list is not exhaustive.
    expect(section).toContain("more resources exist");
  });

  it("round-trips placeholders back to real names via the same session", () => {
    const session = new PseudonymizationSession();
    buildCapabilitySection(descriptors, connections, session);

    const generated = {
      config: {
        operation: "create_database_entry",
        operation_params: {
          database: "[NOTION_DATABASE_1]",
          properties: { "[NOTION_PROPERTY_1]": "[NOTION_OPTION_2]" },
        },
      },
    };
    const rehydrated = session.rehydrateValue(generated);
    expect(JSON.stringify(rehydrated)).toContain("CRM Leads");
    expect(JSON.stringify(rehydrated)).toContain("Deal Status");
    expect(JSON.stringify(rehydrated)).toContain("Won");
  });

  it("aligns user-typed resource mentions with capability placeholders", () => {
    const session = new PseudonymizationSession();
    buildCapabilitySection(descriptors, connections, session);

    const grounded = session.applyKnownValues(
      "When a lead lands in CRM Leads, set Deal Status to Won"
    );
    expect(grounded).toContain("[NOTION_DATABASE_1]");
    expect(grounded).toContain("[NOTION_PROPERTY_1]");
    expect(grounded).toContain("[NOTION_OPTION_2]");
    expect(grounded).not.toContain("CRM Leads");
  });

  it("returns null when there is nothing to show", () => {
    const session = new PseudonymizationSession();
    expect(buildCapabilitySection([], connections, session)).toBeNull();
    expect(
      buildCapabilitySection(
        [{ provider: "gmail", connection_id: "unknown", resources: [] }],
        connections,
        session
      )
    ).toBeNull();
  });
});

describe("summarizeCapabilities", () => {
  it("reports counts only — safe for logs", () => {
    const summary = summarizeCapabilities(descriptors);
    expect(summary).toEqual({ connections: 2, resources: 3, user_named: 4 });
    expect(JSON.stringify(summary)).not.toContain("CRM");
  });
});

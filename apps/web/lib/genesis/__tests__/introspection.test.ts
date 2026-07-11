import { describe, expect, it } from "vitest";

import { PseudonymizationSession } from "@/lib/privacy/pii";
import {
  buildCapabilityNamesSection,
  buildCapabilitySection,
  buildCapabilitySectionsByProvider,
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

describe("buildCapabilityNamesSection", () => {
  it("lists resource names but never their nested properties", () => {
    const session = new PseudonymizationSession();
    const section = buildCapabilityNamesSection(descriptors, connections, session);

    expect(section).toBeTruthy();
    expect(section).toContain("[GMAIL_LABEL_1]");
    expect(section).toContain("[NOTION_DATABASE_1]");
    // Property-level detail belongs to the full section (Phase 2), not this
    // one (Phase 1) — that's the whole point of the lightweight variant.
    expect(section).not.toContain("[NOTION_PROPERTY_1]");
    expect(section).not.toContain("select");
    expect(section).not.toContain("Deal Status");
  });

  it("is meaningfully smaller than the full capability section for the same data", () => {
    const session1 = new PseudonymizationSession();
    const session2 = new PseudonymizationSession();
    const full = buildCapabilitySection(descriptors, connections, session1)!;
    const names = buildCapabilityNamesSection(descriptors, connections, session2)!;
    expect(names.length).toBeLessThan(full.length);
  });

  it("registers the same placeholders as the full section (same session)", () => {
    const session = new PseudonymizationSession();
    buildCapabilitySection(descriptors, connections, session);
    const names = buildCapabilityNamesSection(descriptors, connections, session);
    expect(names).toContain("[NOTION_DATABASE_1]");
  });

  it("returns null when there is nothing to show", () => {
    const session = new PseudonymizationSession();
    expect(buildCapabilityNamesSection([], connections, session)).toBeNull();
  });
});

describe("buildCapabilitySectionsByProvider", () => {
  it("splits capability data into one section per provider", () => {
    const session = new PseudonymizationSession();
    const byProvider = buildCapabilitySectionsByProvider(descriptors, connections, session);

    expect([...byProvider.keys()].sort()).toEqual(["gmail", "notion"]);
    expect(byProvider.get("gmail")).toContain("[GMAIL_LABEL_1]");
    expect(byProvider.get("gmail")).not.toContain("NOTION");
    expect(byProvider.get("notion")).toContain("[NOTION_DATABASE_1]");
    expect(byProvider.get("notion")).not.toContain("GMAIL");
  });

  it("registers the same placeholders as the combined section (same session)", () => {
    const session = new PseudonymizationSession();
    const combined = buildCapabilitySection(descriptors, connections, session);
    const byProvider = buildCapabilitySectionsByProvider(descriptors, connections, session);

    expect(combined).toContain("[NOTION_DATABASE_1]");
    expect(byProvider.get("notion")).toContain("[NOTION_DATABASE_1]");

    // Calling both against the same session must not allocate a second
    // placeholder for the same real value (e.g. [NOTION_DATABASE_2]).
    const rehydrated = session.rehydrateValue({ ref: "[NOTION_DATABASE_1]" });
    expect(rehydrated).toEqual({ ref: "CRM Leads" });
  });

  it("omits a provider with no renderable resources", () => {
    const session = new PseudonymizationSession();
    const byProvider = buildCapabilitySectionsByProvider(
      [{ provider: "slack", connection_id: "unknown", resources: [] }],
      connections,
      session
    );
    expect(byProvider.size).toBe(0);
  });

  it("returns an empty map for no descriptors", () => {
    const session = new PseudonymizationSession();
    expect(buildCapabilitySectionsByProvider([], connections, session).size).toBe(0);
  });
});

describe("summarizeCapabilities", () => {
  it("reports counts only — safe for logs", () => {
    const summary = summarizeCapabilities(descriptors);
    expect(summary).toEqual({ connections: 2, resources: 3, user_named: 4 });
    expect(JSON.stringify(summary)).not.toContain("CRM");
  });
});

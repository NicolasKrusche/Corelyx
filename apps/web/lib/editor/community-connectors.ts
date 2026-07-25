/**
 * Community Connectors — bridge between the registry and the node palette.
 *
 * Server-side helper that loads community connector entries from the registry
 * and converts them into PaletteNodeEntry objects that the existing node palette
 * can render.
 */

import type { PaletteNodeEntry } from "@/lib/editor/node-palette-data";
import type { ConnectorRegistryEntry } from "@flowos/registry";

// ─── Static seed data (mirrors registry.json for SSR/SSG without JSON import) ─

const COMMUNITY_CONNECTORS: ConnectorRegistryEntry[] = [
  {
    name: "community/zendesk",
    version: "1.2.0",
    description: "Create, update, and search Zendesk support tickets",
    author: "flowos-community",
    operations: [
      { name: "list_tickets", description: "List all support tickets", parameterCount: 4 },
      { name: "get_ticket", description: "Get a single ticket by ID", parameterCount: 1 },
      { name: "create_ticket", description: "Create a new support ticket", parameterCount: 6 },
      { name: "update_ticket", description: "Update an existing ticket", parameterCount: 3 },
    ],
    rating: 4.7,
    downloads: 1240,
    tags: ["support", "tickets", "helpdesk"],
    provider: "zendesk",
    icon: "Headphones",
    publishedAt: "2026-07-10T14:30:00Z",
    requiresAuth: true,
  },
  {
    name: "community/stripe",
    version: "2.0.1",
    description: "Manage Stripe payments, customers, and subscriptions",
    author: "payments-team",
    operations: [
      { name: "list_customers", description: "List all Stripe customers", parameterCount: 3 },
      { name: "create_payment_intent", description: "Create a new payment intent", parameterCount: 5 },
      { name: "list_invoices", description: "List invoices", parameterCount: 4 },
      { name: "retrieve_subscription", description: "Get subscription details", parameterCount: 1 },
      { name: "create_webhook_endpoint", description: "Register a webhook endpoint", parameterCount: 3 },
    ],
    rating: 4.9,
    downloads: 3420,
    tags: ["payments", "billing", "subscriptions", "stripe"],
    provider: "stripe",
    icon: "CreditCard",
    publishedAt: "2026-07-18T09:00:00Z",
    requiresAuth: true,
  },
  {
    name: "community/notion-db",
    version: "1.0.0",
    description: "Advanced Notion database queries with filters and sorts",
    author: "notion-power-users",
    operations: [
      { name: "query_database", description: "Query a Notion database", parameterCount: 3 },
      { name: "get_database_schema", description: "Retrieve the property schema", parameterCount: 1 },
      { name: "create_database_entry", description: "Create a new row in a database", parameterCount: 2 },
    ],
    rating: 4.3,
    downloads: 870,
    tags: ["notion", "database", "queries"],
    provider: "notion",
    icon: "BookOpen",
    publishedAt: "2026-06-28T16:45:00Z",
    requiresAuth: true,
  },
];

// ─── Convert registry entry → palette node ───────────────────────────────────

export function registryToPaletteNode(
  entry: ConnectorRegistryEntry,
): PaletteNodeEntry {
  // Determine input/output port types based on provider
  const inputPorts: PaletteNodeEntry["ports"]["inputs"] = ["data"];
  const outputPorts: PaletteNodeEntry["ports"]["outputs"] = ["data"];

  // Notion DB queries output arrays for queries
  if (entry.name.includes("notion-db")) {
    outputPorts.push("array");
  }
  // Stripe returns structured data
  if (entry.name.includes("stripe")) {
    outputPorts.push("text");
  }

  return {
    key: `community-${entry.provider}`,
    nodeType: "connection",
    subtype: entry.provider,
    label: entry.name.split("/").pop() ?? entry.provider,
    description: entry.description,
    category: "connector",
    provider: entry.provider,
    icon: entry.icon,
    ports: { inputs: inputPorts, outputs: outputPorts },
    tags: [
      ...entry.tags,
      "community",
      "marketplace",
      entry.author,
      `v${entry.version}`,
    ],
  };
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/** Get all community connector palette nodes. */
export function getCommunityPaletteNodes(): PaletteNodeEntry[] {
  return COMMUNITY_CONNECTORS.map(registryToPaletteNode);
}

/** Get community connector entries as raw data (for the browser UI). */
export function getCommunityConnectorEntries(): ConnectorRegistryEntry[] {
  return COMMUNITY_CONNECTORS;
}

/** Search community connectors by query. */
export function searchCommunityConnectors(
  query: string,
): ConnectorRegistryEntry[] {
  if (!query.trim()) return COMMUNITY_CONNECTORS;
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return COMMUNITY_CONNECTORS.filter((entry) => {
    const searchable = [
      entry.name,
      entry.description,
      entry.author,
      entry.provider,
      ...entry.tags,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((w) => searchable.includes(w));
  });
}

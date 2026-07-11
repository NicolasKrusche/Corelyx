import "server-only";

import { buildInternalServiceHeaders } from "@/lib/internal-auth";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { serverLog } from "@/lib/server-log";
import type { PseudonymizationSession } from "@/lib/privacy/pii";
import type { GenesisConnectionRow } from "@/lib/genesis/request";

/**
 * Genesis V2 connection introspection (web side).
 *
 * The runtime returns metadata-only capability descriptors (label names,
 * channel names, database schemas — never record contents). Everything the
 * user themselves named is user data: it is registered with the request's
 * PseudonymizationSession here and only placeholders like [GMAIL_LABEL_1]
 * ever reach the LLM prompt. Raw names stay in server memory for the life of
 * the request and are substituted back into the generated schema on
 * rehydration. Nothing in this module is persisted or logged beyond counts.
 */

export type CapabilityProperty = {
  name: string;
  type: string;
  options?: string[];
};

export type CapabilityResource = {
  kind: string;
  name: string;
  user_named: boolean;
  properties?: CapabilityProperty[];
  properties_truncated?: boolean;
};

export type CapabilityDescriptor = {
  provider: string;
  connection_id: string;
  resources: CapabilityResource[];
  granted_scopes?: string[];
  truncated?: boolean;
};

const INTROSPECT_TIMEOUT_MS = 8_000;

/**
 * Fetch capability descriptors from the runtime for the selected connections.
 * Failures degrade gracefully: callers fall back to the static connector
 * catalog, so this never throws — it returns [] instead.
 */
export async function fetchConnectionCapabilities(
  connectionIds: string[],
  userId: string
): Promise<CapabilityDescriptor[]> {
  if (connectionIds.length === 0) return [];

  const body = JSON.stringify({ connection_ids: connectionIds });
  const path = "/introspect";
  try {
    const response = await fetch(`${getRuntimeUrl()}${path}`, {
      method: "POST",
      headers: buildInternalServiceHeaders(
        "runtime:introspect",
        { "Content-Type": "application/json" },
        { subject: userId, method: "POST", path, body }
      ),
      body,
      signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      // The most common silent failure: introspect auth misconfigured (401) or
      // runtime unreachable. Log the status so it isn't invisible.
      serverLog({
        level: "warn",
        event: "genesis.introspection.http_error",
        message: "Connection introspection call to the runtime failed; using static catalog.",
        details: { status: response.status, connection_count: connectionIds.length },
      });
      return [];
    }
    const parsed = (await response.json()) as {
      descriptors?: CapabilityDescriptor[];
      errors?: Record<string, string>;
    };
    const descriptors = Array.isArray(parsed.descriptors) ? parsed.descriptors : [];
    // Per-connection error CODES only (never names/content) — the key
    // diagnostic for "introspection returned nothing" (e.g. TOKEN_FETCH_FAILED,
    // UNSUPPORTED_PROVIDER, PROVIDER_UNREACHABLE, CONNECTION_NOT_FOUND).
    const errorCodes = parsed.errors ? Object.values(parsed.errors) : [];
    serverLog({
      level: errorCodes.length > 0 && descriptors.length === 0 ? "warn" : "info",
      event: "genesis.introspection.result",
      message: "Connection introspection completed.",
      details: {
        connection_count: connectionIds.length,
        descriptor_count: descriptors.length,
        error_codes: errorCodes.length > 0 ? [...new Set(errorCodes)].join(",") : "",
      },
    });
    return descriptors;
  } catch (err) {
    // Timeout, network failure, or missing secret — generation proceeds on
    // the static catalog alone.
    serverLog({
      level: "warn",
      event: "genesis.introspection.unreachable",
      message: "Connection introspection could not reach the runtime; using static catalog.",
      details: { error: err instanceof Error ? err.name : "unknown", connection_count: connectionIds.length },
    });
    return [];
  }
}

function placeholderCategory(provider: string, kind: string): string {
  return `${provider}_${kind}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Render descriptors as a prompt section, registering every user-named string
 * with the pseudonymization session so only placeholders appear in the text.
 * Returns null when there is nothing useful to show.
 */
export function buildCapabilitySection(
  descriptors: CapabilityDescriptor[],
  connections: GenesisConnectionRow[],
  session: PseudonymizationSession
): string | null {
  if (descriptors.length === 0) return null;

  const connectionById = new Map(connections.map((row) => [row.id, row]));
  const lines: string[] = [
    "LIVE CONNECTION CAPABILITIES (introspected from the user's real accounts just now):",
    "User-created names are pseudonymized as [CATEGORY_N] placeholders. When the user's request refers to one of these resources, copy its placeholder EXACTLY (including brackets) into operation_params, labels, and prompts — real names are substituted back after generation. Never invent placeholder numbers that are not listed here. Placeholders appearing in the user's description refer to the same resources listed below.",
    "",
  ];

  let rendered = 0;
  for (const descriptor of descriptors) {
    const row = connectionById.get(descriptor.connection_id);
    if (!row || descriptor.resources.length === 0) continue;
    rendered += 1;

    const grantedScopes = [
      ...(Array.isArray(row.scopes) ? row.scopes : []),
      ...(descriptor.granted_scopes ?? []),
    ];
    const scopesNote = grantedScopes.length > 0
      ? ` — granted scopes: ${[...new Set(grantedScopes)].join(", ")}`
      : "";
    lines.push(`Connection "${row.name}" (${descriptor.provider})${scopesNote}:`);

    for (const resource of descriptor.resources) {
      const displayName = resource.user_named
        ? session.registerKnownValue(
            placeholderCategory(descriptor.provider, resource.kind),
            resource.name
          )
        : resource.name;

      if (!resource.properties || resource.properties.length === 0) {
        lines.push(`  - ${resource.kind}: ${displayName}`);
        continue;
      }

      lines.push(`  - ${resource.kind}: ${displayName} with properties:`);
      for (const property of resource.properties) {
        const propertyPlaceholder = session.registerKnownValue(
          placeholderCategory(descriptor.provider, "property"),
          property.name
        );
        const optionsText = property.options && property.options.length > 0
          ? ` (options: ${property.options
              .map((option) =>
                session.registerKnownValue(
                  placeholderCategory(descriptor.provider, "option"),
                  option
                )
              )
              .join(", ")})`
          : "";
        lines.push(`      ${propertyPlaceholder}: ${property.type}${optionsText}`);
      }
      if (resource.properties_truncated) {
        lines.push("      (more properties exist but are not listed)");
      }
    }
    if (descriptor.truncated) {
      lines.push("  (more resources exist but are not listed)");
    }
    lines.push("");
  }

  if (rendered === 0) return null;
  return lines.join("\n");
}

/**
 * Lightweight version of buildCapabilitySection: resource names only, no
 * nested properties (a Notion database's property schema, a form's fields,
 * etc.). Used by decomposed generation's plan stage, which should know WHICH
 * real resources exist — for sharper connection-node purposes and clarifying
 * questions — without the property-level detail that only matters once a
 * later stage is filling in operation_params for one specific operation.
 * Keeping this small matters here specifically: the plan stage's whole point
 * is staying free of the context bloat that hurts small models most, and
 * property listings (the bulk of buildCapabilitySection's output for a
 * database-shaped resource) are exactly that kind of bloat at this stage.
 */
export function buildCapabilityNamesSection(
  descriptors: CapabilityDescriptor[],
  connections: GenesisConnectionRow[],
  session: PseudonymizationSession
): string | null {
  if (descriptors.length === 0) return null;

  const connectionById = new Map(connections.map((row) => [row.id, row]));
  const lines: string[] = [
    "KNOWN RESOURCES (introspected from the user's real accounts just now — names only; a later stage resolves each resource's fields):",
    "User-created names are pseudonymized as [CATEGORY_N] placeholders. Copy a placeholder EXACTLY (including brackets) when a purpose or clarifying question refers to one of these. Never invent a placeholder number not listed here.",
    "",
  ];

  let rendered = 0;
  for (const descriptor of descriptors) {
    const row = connectionById.get(descriptor.connection_id);
    if (!row || descriptor.resources.length === 0) continue;
    rendered += 1;

    const names = descriptor.resources.map((resource) => {
      const displayName = resource.user_named
        ? session.registerKnownValue(placeholderCategory(descriptor.provider, resource.kind), resource.name)
        : resource.name;
      return `${resource.kind}: ${displayName}`;
    });
    lines.push(`Connection "${row.name}" (${descriptor.provider}): ${names.join("; ")}`);
  }

  if (rendered === 0) return null;
  return lines.join("\n");
}

/**
 * Same data as buildCapabilitySection, split into one section per provider.
 * Decomposed generation's resolve pass (lib/genesis/decomposed-generation.ts)
 * runs one narrow call per provider — it should only see that provider's own
 * capability data, not every selected connector's combined capabilities,
 * matching the same "no irrelevant context" reasoning as the operation docs.
 * Safe to call alongside buildCapabilitySection on the same descriptors: each
 * descriptor belongs to exactly one provider, so nothing is double-registered
 * with the pseudonymization session.
 */
export function buildCapabilitySectionsByProvider(
  descriptors: CapabilityDescriptor[],
  connections: GenesisConnectionRow[],
  session: PseudonymizationSession
): Map<string, string> {
  const byProvider = new Map<string, string>();
  const providers = new Set(descriptors.map((d) => d.provider));
  for (const provider of providers) {
    const section = buildCapabilitySection(
      descriptors.filter((d) => d.provider === provider),
      connections,
      session
    );
    if (section) byProvider.set(provider, section);
  }
  return byProvider;
}

/** Counts-only summary for logs — never raw names. */
export function summarizeCapabilities(descriptors: CapabilityDescriptor[]): {
  connections: number;
  resources: number;
  user_named: number;
} {
  let resources = 0;
  let userNamed = 0;
  for (const descriptor of descriptors) {
    resources += descriptor.resources.length;
    for (const resource of descriptor.resources) {
      if (resource.user_named) userNamed += 1;
      userNamed += resource.properties?.length ?? 0;
    }
  }
  return { connections: descriptors.length, resources, user_named: userNamed };
}

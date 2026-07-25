/**
 * @flowos/registry — Registry Client
 *
 * Client for reading community connector entries from the registry file.
 * In production this would fetch from a hosted JSON endpoint or GitHub raw URL;
 * for now it reads from a local registry.json file.
 */

import type { ConnectorRegistryEntry } from "./types.js";

export interface RegistryIndex {
  version: string;
  lastUpdated: string;
  entries: ConnectorRegistryEntry[];
}

/**
 * Fetch the full registry index.
 * Uses a relative import so the bundler resolves registry.json at build time.
 */
async function loadRegistryIndex(): Promise<RegistryIndex> {
  // Dynamic import so we can handle both ESM and Node resolution.
  // The JSON file sits alongside this module in the registry package.
  const mod = await import("../registry.json", { with: { type: "json" } });
  return (mod as { default: RegistryIndex }).default;
}

/**
 * High-level client for interacting with the connector registry.
 */
export class RegistryClient {
  private cache: ConnectorRegistryEntry[] | null = null;

  /** Fetch all registry entries (cached after first call). */
  async fetchEntries(): Promise<ConnectorRegistryEntry[]> {
    if (this.cache) return this.cache;
    const index = await loadRegistryIndex();
    this.cache = index.entries;
    return this.cache;
  }

  /** Search entries by query string (matches name, description, tags, author). */
  async search(query: string): Promise<ConnectorRegistryEntry[]> {
    const entries = await this.fetchEntries();
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return entries.filter((entry) => {
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

  /** Get a single entry by its unique name. */
  async getEntry(name: string): Promise<ConnectorRegistryEntry | undefined> {
    const entries = await this.fetchEntries();
    return entries.find((e) => e.name === name);
  }

  /**
   * "Install" a community connector.
   * In this prototype it simply returns the entry metadata;
   * the caller (web app) is responsible for merging it into the node palette.
   */
  async install(name: string): Promise<ConnectorRegistryEntry | undefined> {
    const entry = await this.getEntry(name);
    if (!entry) return undefined;
    // Increment download count locally (would be a POST in production)
    entry.downloads += 1;
    return entry;
  }
}

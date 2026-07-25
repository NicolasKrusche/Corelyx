/**
 * @flowos/registry — Types
 *
 * Types for the Community Connector Registry.
 */

export interface RegistryOperation {
  /** Operation name (e.g. "list_tickets"). */
  name: string;
  /** Human-readable description. */
  description?: string;
  /** Number of input parameters. */
  parameterCount: number;
}

export interface ConnectorRegistryEntry {
  /** Unique package name (e.g. "community/zendesk"). */
  name: string;
  /** Semver version string. */
  version: string;
  /** Short one-liner description. */
  description: string;
  /** Author name or GitHub handle. */
  author: string;
  /** GitHub repository URL (optional). */
  repository?: string;
  /** Operations this connector exposes. */
  operations: RegistryOperation[];
  /** Average user rating (0–5). */
  rating: number;
  /** Total install count. */
  downloads: number;
  /** Tags for search indexing. */
  tags: string[];
  /** Connector provider slug (maps to icon lookup). */
  provider: string;
  /** Lucide icon name fallback. */
  icon: string;
  /** ISO 8601 date of last publish. */
  publishedAt: string;
  /** Whether this connector requires OAuth. */
  requiresAuth: boolean;
}

"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Download,
  Star,
  ExternalLink,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ConnectorRegistryEntry } from "@flowos/registry";
import {
  getCommunityConnectorEntries,
  searchCommunityConnectors,
} from "@/lib/editor/community-connectors";
import type { ConnectionSubtype } from "./NodePalettePanel";

// ─── Star rating display ─────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-2.5 w-2.5",
            i < full
              ? "fill-amber-400 text-amber-400"
              : i === full && hasHalf
                ? "fill-amber-400/50 text-amber-400"
                : "text-muted-foreground/30",
          )}
        />
      ))}
      <span className="ml-0.5 font-mono text-foreground/70">{rating}</span>
    </span>
  );
}

// ─── Connector card ──────────────────────────────────────────────────────────

interface ConnectorCardProps {
  entry: ConnectorRegistryEntry;
  onInstall: (entry: ConnectorRegistryEntry) => void;
}

function ConnectorCard({ entry, onInstall }: ConnectorCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Package className="h-3 w-3 text-muted-foreground shrink-0" />
            <h4 className="text-xs font-semibold text-foreground truncate">
              {entry.name.split("/").pop()}
            </h4>
            <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
              v{entry.version}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {entry.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onInstall(entry)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1",
            "text-[10px] font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "transition-colors",
          )}
        >
          <Download className="h-2.5 w-2.5" />
          Install
        </button>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>by {entry.author}</span>
        <StarRating rating={entry.rating} />
        <span className="flex items-center gap-0.5">
          <Download className="h-2.5 w-2.5" />
          {entry.downloads.toLocaleString()}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {entry.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Operations expandable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronUp className="h-2.5 w-2.5" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5" />
        )}
        {entry.operations.length} operation{entry.operations.length !== 1 ? "s" : ""}
      </button>

      {expanded && (
        <ul className="space-y-1 pl-1">
          {entry.operations.map((op) => (
            <li key={op.name} className="text-[10px] text-muted-foreground">
              <span className="font-mono text-foreground/70">{op.name}</span>
              {op.description && (
                <span className="ml-1">— {op.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Repository link */}
      {entry.repository && (
        <a
          href={entry.repository}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View source
        </a>
      )}
    </div>
  );
}

// ─── Main browser component ──────────────────────────────────────────────────

export interface CommunityConnectorBrowserProps {
  /** Called when user clicks "Install" on a connector. */
  onInstall?: (entry: ConnectorRegistryEntry) => void;
  /** Optional: also add as a node to the canvas directly. */
  onAddToCanvas?: (subtype: ConnectionSubtype) => void;
}

export function CommunityConnectorBrowser({
  onInstall,
  onAddToCanvas,
}: CommunityConnectorBrowserProps) {
  const [search, setSearch] = useState("");
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const results = useMemo(
    () => searchCommunityConnectors(search),
    [search],
  );

  function handleInstall(entry: ConnectorRegistryEntry) {
    setInstalled((prev) => new Set(prev).add(entry.name));
    onInstall?.(entry);
    // Also offer to add to canvas directly
    onAddToCanvas?.(entry.provider as ConnectionSubtype);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Community Marketplace</h3>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search community connectors..."
          className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-[10px] text-muted-foreground">
        {results.length} connector{results.length !== 1 ? "s" : ""} available
      </p>

      {/* Connector cards */}
      <div className="space-y-2">
        {results.map((entry) => (
          <ConnectorCard
            key={entry.name}
            entry={entry}
            onInstall={handleInstall}
          />
        ))}
      </div>

      {results.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">
          No connectors match your search.
        </p>
      )}

      {/* Installed notice */}
      {installed.size > 0 && (
        <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2 text-[10px] text-green-700 dark:text-green-400">
          ✓ {installed.size} connector{installed.size !== 1 ? "s" : ""} installed
          and added to your palette.
        </div>
      )}
    </div>
  );
}

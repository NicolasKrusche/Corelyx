"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

// Map our connector provider slugs → simple-icons CDN slugs.
const SIMPLE_ICON_SLUG: Record<string, string> = {
  gmail: "gmail",
  notion: "notion",
  slack: "slack",
  github: "github",
  sheets: "googlesheets",
  calendar: "googlecalendar",
  docs: "googledocs",
  drive: "googledrive",
  airtable: "airtable",
  hubspot: "hubspot",
  typeform: "typeform",
  asana: "asana",
  outlook: "microsoftoutlook",
  shopify: "shopify",
  zoom: "zoom",
  sentry: "sentry",
  gitlab: "gitlab",
  confluence: "confluence",
  jira: "jira",
  dropbox: "dropbox",
  todoist: "todoist",
  calendly: "calendly",
};

/**
 * Renders a connector's brand logo from the simple-icons CDN, with a monogram
 * fallback for unknown providers or if the image fails to load (e.g. blocked).
 */
export function ProviderLogo({
  provider,
  label,
  className,
}: {
  provider?: string | null;
  label?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const slug = provider ? SIMPLE_ICON_SLUG[provider] : undefined;

  if (slug && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://cdn.simpleicons.org/${slug}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        className={cn("object-contain", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  const letter = (label || provider || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span className={cn("grid place-items-center text-[11px] font-bold text-zinc-500", className)} aria-hidden="true">
      {letter}
    </span>
  );
}

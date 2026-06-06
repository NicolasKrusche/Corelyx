"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { PROVIDER_ICON_URL } from "@/lib/provider-icons";

/**
 * Renders a connector's brand logo using the same icon source as the "Add node"
 * sidebar (PROVIDER_ICON_URL), with a 2-letter monogram fallback for unknown
 * providers or if the image fails to load.
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
  const url = provider ? PROVIDER_ICON_URL[provider] : undefined;

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        className={cn("object-contain", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  const text = (provider || label || "?").trim().slice(0, 2).toUpperCase();
  return (
    <span className={cn("grid place-items-center text-[10px] font-bold text-zinc-500", className)} aria-hidden="true">
      {text}
    </span>
  );
}

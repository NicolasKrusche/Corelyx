"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Auth-aware CTA for public SEO pages. The pages stay statically rendered —
 * this swaps "Sign in" for "Dashboard" client-side once a session is found.
 */
export function SeoAuthButton() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) setSignedIn(true);
      })
      .catch(() => {
        // Stay on "Sign in" if the session check fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={signedIn ? "/dashboard" : "/login"}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
    >
      {signedIn ? "Dashboard" : "Sign in"}
    </Link>
  );
}

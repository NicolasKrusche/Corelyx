"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UpgradeBanner } from "@/components/ui/upgrade-banner";

const DISMISS_KEY = "corelyx:dashboard-upgrade-nudge-dismissed";

/**
 * Dismissible upgrade nudge shown to free-tier users on the dashboard.
 * Hidden once dismissed (persisted in localStorage so it doesn't re-nag).
 */
export function UpgradeBannerNudge() {
  const router = useRouter();
  // Start hidden and reveal after mount so the localStorage check doesn't
  // cause a hydration flash.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <UpgradeBanner
      className="justify-start"
      buttonText="Upgrade your plan"
      description="for more runs, more programs, and your own API keys (BYOK)"
      onClick={() => router.push("/plan")}
      onClose={() => {
        window.localStorage.setItem(DISMISS_KEY, "1");
        setVisible(false);
      }}
    />
  );
}

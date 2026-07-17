"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { PersistentAiDisclosure } from "@/components/ai-transparency";
import { CookieNotice } from "@/components/consent-banner";

export function RouteAwareGlobalNotices({
  aiDisclosureTitle,
  aiDisclosureMessage,
}: {
  aiDisclosureTitle: string;
  aiDisclosureMessage: string;
}) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  return (
    <>
      <CookieNotice
        aiDisclosureTitle={isLandingPage ? undefined : aiDisclosureTitle}
        aiDisclosureMessage={isLandingPage ? undefined : aiDisclosureMessage}
      />
      {!isLandingPage && (
        <PersistentAiDisclosure
          title={aiDisclosureTitle}
          message={aiDisclosureMessage}
        />
      )}
    </>
  );
}

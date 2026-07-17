import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePathname = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname }));

import { RouteAwareGlobalNotices } from "../route-aware-global-notices";

describe("RouteAwareGlobalNotices", () => {
  beforeEach(() => {
    usePathname.mockReset();
  });

  it("does not server-render the global AI disclosure on the landing page", () => {
    usePathname.mockReturnValue("/");

    const markup = renderToStaticMarkup(
      <RouteAwareGlobalNotices
        aiDisclosureTitle="AI disclosure"
        aiDisclosureMessage="You are interacting with AI."
      />
    );

    expect(markup).toBe("");
  });

  it("keeps the global AI disclosure on application routes", () => {
    usePathname.mockReturnValue("/dashboard");

    const markup = renderToStaticMarkup(
      <RouteAwareGlobalNotices
        aiDisclosureTitle="AI disclosure"
        aiDisclosureMessage="You are interacting with AI."
      />
    );

    expect(markup).toContain("persistent-ai-disclosure");
    expect(markup).toContain("You are interacting with AI");
  });
});

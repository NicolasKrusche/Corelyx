import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AiGeneratedContentNotice,
  AiIdentityBadge,
  PersistentAiDisclosure,
} from "../ai-transparency";

describe("AI transparency components", () => {
  it("renders a fixed global AI disclosure, expanded by default and collapsible but never removable", () => {
    // Art. 50 requires disclosure at first interaction/exposure: SSR default is
    // the full expanded banner. Users may collapse it to a pill (it stays on
    // screen) so it cannot cover bottom-anchored UI on small screens.
    const markup = renderToStaticMarkup(
      <PersistentAiDisclosure
        title="AI disclosure"
        message="You are interacting with AI. Verify important results."
      />
    );

    expect(markup).toContain('role="note"');
    expect(markup).toContain("persistent-ai-disclosure");
    expect(markup).toContain("fixed");
    expect(markup).toContain("You are interacting with AI");
    expect(markup).toContain('aria-expanded="true"');
  });

  it("identifies AI-authored messages visibly and accessibly", () => {
    const markup = renderToStaticMarkup(<AiIdentityBadge label="Genesis AI" />);

    expect(markup).toContain("Genesis AI");
    expect(markup).toContain("artificial intelligence");
  });

  it("warns that AI-generated output needs verification", () => {
    const markup = renderToStaticMarkup(
      <AiGeneratedContentNotice contentKind="report" />
    );

    expect(markup).toContain("AI-generated report");
    expect(markup).toContain("Verify important");
  });
});

import { describe, expect, it } from "vitest";

import { buildGenesisSystemPrompt } from "../prompt";

describe("Genesis prompt", () => {
  it("documents secure OAuth-backed HTTP fallbacks and concrete loop references", () => {
    const prompt = buildGenesisSystemPrompt(["gmail"]);

    expect(prompt).toContain('auth_value:"__OAUTH_CONNECTION__"');
    expect(prompt).toContain("Use the actual upstream node ID in every {{expression}}");
    expect(prompt).toContain("e.g. {{n4.email.id}}");
    expect(prompt).not.toContain("downstream accesses {{loop_id.item}}");
  });
});

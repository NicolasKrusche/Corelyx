import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("account export schema metadata", () => {
  it("keeps bundle, audit, and response metadata on schema version 6", () => {
    const route = readFileSync(
      join(__dirname, "../../app/api/user/export/route.ts"),
      "utf8"
    );

    expect(route).toContain("schema_version: 6");
    expect(route).not.toContain("schema_version: 5");
    expect(route).toContain('"X-Corelyx-Export-Schema-Version": "6"');
    expect(route).not.toContain('"X-Corelyx-Export-Schema-Version": "5"');
  });
});

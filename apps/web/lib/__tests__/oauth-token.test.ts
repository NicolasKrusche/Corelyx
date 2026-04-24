import { describe, expect, it } from "vitest";
import { summarizeRefreshFailure } from "../oauth-token";

describe("summarizeRefreshFailure", () => {
  it("redacts raw upstream OAuth error bodies from logs and user messages", () => {
    const summary = summarizeRefreshFailure(
      "gmail",
      400,
      JSON.stringify({
        error: "invalid_grant",
        error_description: "refresh token abc123 should never appear",
      }),
      new Headers({
        "x-request-id": "req-123",
      })
    );

    expect(summary.errorCode).toBe("invalid_grant");
    expect(summary.logMessage).toContain("provider=gmail");
    expect(summary.logMessage).toContain("status=400");
    expect(summary.logMessage).toContain("error_code=invalid_grant");
    expect(summary.logMessage).toContain("request_id=req-123");
    expect(summary.logMessage).not.toContain("abc123");
    expect(summary.userMessage).toContain("invalid_grant");
    expect(summary.userMessage).not.toContain("abc123");
  });
});

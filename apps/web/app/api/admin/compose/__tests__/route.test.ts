import { describe, expect, it, vi, beforeEach } from "vitest";

// The admin compose route must surface the email provider's real rejection
// (e.g. "domain is not verified") instead of the generic 5xx masking apiError
// applies — admins need the actual reason to act on it.

vi.mock("@/lib/api", () => ({
  apiError: (message: string, status: number) =>
    Response.json({ error: status >= 500 ? "Internal server error" : message }, { status }),
  getAuthUser: vi.fn(async () => ({ id: "admin-user", email: "admin@corelyx.app" })),
}));

vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(async () => true),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}));

import { POST } from "../route";
import { sendEmail } from "@/lib/email";

function composeRequest() {
  return new Request("http://localhost/api/admin/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "legal@corelyx.app",
      to: "someone@example.com",
      subject: "Test",
      body: "This is a test",
    }),
  });
}

describe("POST /api/admin/compose", () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset();
  });

  it("returns the provider's actual error message on send failure, not a generic 500 mask", async () => {
    vi.mocked(sendEmail).mockRejectedValue(
      new Error("[email] Resend error 403: The corelyx.app domain is not verified")
    );

    const res = await POST(composeRequest());
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("domain is not verified");
    expect(data.error).not.toBe("Internal server error");
  });

  it("redacts secrets from the surfaced error message", async () => {
    vi.mocked(sendEmail).mockRejectedValue(
      new Error("request failed: Bearer abcdefghijklmnopqrstuvwxyz123456 rejected")
    );

    const res = await POST(composeRequest());
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(data.error).toContain("[redacted]");
  });

  it("sends and reports success", async () => {
    vi.mocked(sendEmail).mockResolvedValue(undefined);

    const res = await POST(composeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Corelyx <legal@corelyx.app>", to: ["someone@example.com"] })
    );
  });
});

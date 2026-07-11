import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();

vi.mock("@/lib/api", () => ({
  createServiceClient: () => ({
    from: () => ({ insert }),
  }),
}));

import { recordTriggerEvent } from "@/lib/trigger-events";

describe("recordTriggerEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the database insert", async () => {
    let release!: () => void;
    insert.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve({ error: null });
    }));

    let settled = false;
    const write = recordTriggerEvent({
      triggerId: "trigger-1",
      programId: "program-1",
      source: "cron",
      status: "dispatched",
    }).then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await write;
    expect(settled).toBe(true);
  });

  it("swallows thrown client errors so a completed dispatch is not failed", async () => {
    insert.mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recordTriggerEvent({
      triggerId: "trigger-1",
      programId: "program-1",
      source: "cron",
      status: "dispatched",
    })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[trigger-events] insert failed:", "network down");
    warn.mockRestore();
  });
});

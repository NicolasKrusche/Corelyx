import { describe, expect, it, vi } from "vitest";
import { removeTrigger, setTriggerActive } from "@/lib/triggers/manage-trigger";

describe("trigger management requests", () => {
  it("returns the server-confirmed trigger after a successful toggle", async () => {
    const trigger = { id: "trigger-1", is_active: false, next_run_at: null };
    const fetchImpl = vi.fn(async () => Response.json({ trigger }));

    await expect(setTriggerActive("program-1", "trigger-1", false, fetchImpl as typeof fetch))
      .resolves.toEqual(trigger);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/programs/program-1/triggers/trigger-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ is_active: false }) })
    );
  });

  it("rejects a failed toggle instead of returning optimistic state", async () => {
    const fetchImpl = vi.fn(async () => Response.json(
      { error: "Workflow changed while updating the schedule. Reload and try again." },
      { status: 409 }
    ));

    await expect(setTriggerActive("program-1", "trigger-1", false, fetchImpl as typeof fetch))
      .rejects.toThrow("Workflow changed while updating the schedule");
  });

  it("surfaces schema-owned deletion guidance", async () => {
    const fetchImpl = vi.fn(async () => Response.json(
      { error: "This schedule is part of the workflow. Remove its trigger node in the editor." },
      { status: 409 }
    ));

    await expect(removeTrigger("program-1", "trigger-1", fetchImpl as typeof fetch))
      .rejects.toThrow("Remove its trigger node in the editor");
  });
});

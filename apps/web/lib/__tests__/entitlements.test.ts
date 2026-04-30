import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getEntitlements,
  hasTriggerAccess,
  parseTier,
  ENTITLEMENTS,
  type Tier,
  type TriggerType,
} from "../entitlements";

// ─── parseTier ────────────────────────────────────────────────────────────────

describe("parseTier", () => {
  it("returns known tiers as-is", () => {
    const tiers: Tier[] = ["free", "plus", "pro", "builder", "unlimited"];
    for (const t of tiers) {
      expect(parseTier(t)).toBe(t);
    }
  });

  it("falls back to free for unknown values", () => {
    expect(parseTier("enterprise")).toBe("free");
    expect(parseTier("")).toBe("free");
    expect(parseTier(null)).toBe("free");
    expect(parseTier(undefined)).toBe("free");
  });
});

// ─── getEntitlements ──────────────────────────────────────────────────────────

describe("getEntitlements", () => {
  it("returns the correct config for free tier", () => {
    const ent = getEntitlements("free");
    expect(ent.maxPrograms).toBe(2);
    expect(ent.runsPerMonth).toBe(50);
    expect(ent.runHistoryDays).toBe(7);
    expect(ent.genesisUsesPerMonth).toBe(3);
    expect(ent.byok).toBe(false);
    expect(ent.hitlApprovals).toBe(false);
    expect(ent.conflictDetection).toBe(false);
    expect(ent.priorityExecution).toBe(false);
    expect(ent.maxTeamSeats).toBe(1);
  });

  it("free: only manual and cron triggers allowed", () => {
    const { triggers } = getEntitlements("free");
    expect(triggers.manual).toBe(true);
    expect(triggers.cron).toBe(true);
    expect(triggers.webhook).toBe(false);
    expect(triggers.event).toBe(false);
    expect(triggers.program).toBe(false);
  });

  it("returns the correct config for plus (Solo) tier", () => {
    const ent = getEntitlements("plus");
    expect(ent.maxPrograms).toBe(5);
    expect(ent.runsPerMonth).toBe(75);
    expect(ent.runHistoryDays).toBe(30);
    expect(ent.genesisUsesPerMonth).toBeNull();
    expect(ent.byok).toBe(true);
    expect(ent.hitlApprovals).toBe(false);
    expect(ent.conflictDetection).toBe(false);
    expect(ent.priorityExecution).toBe(false);
    expect(ent.maxTeamSeats).toBe(1);
  });

  it("plus: manual, cron, webhook allowed; event and program not", () => {
    const { triggers } = getEntitlements("plus");
    expect(triggers.manual).toBe(true);
    expect(triggers.cron).toBe(true);
    expect(triggers.webhook).toBe(true);
    expect(triggers.event).toBe(false);
    expect(triggers.program).toBe(false);
  });

  it("returns the correct config for pro (Team) tier", () => {
    const ent = getEntitlements("pro");
    expect(ent.maxPrograms).toBeNull();
    expect(ent.runsPerMonth).toBe(500);
    expect(ent.runHistoryDays).toBe(90);
    expect(ent.genesisUsesPerMonth).toBeNull();
    expect(ent.byok).toBe(true);
    expect(ent.hitlApprovals).toBe(true);
    expect(ent.conflictDetection).toBe(true);
    expect(ent.priorityExecution).toBe(false);
    expect(ent.maxTeamSeats).toBe(3);
  });

  it("pro: all trigger types allowed", () => {
    const { triggers } = getEntitlements("pro");
    expect(triggers.manual).toBe(true);
    expect(triggers.cron).toBe(true);
    expect(triggers.webhook).toBe(true);
    expect(triggers.event).toBe(true);
    expect(triggers.program).toBe(true);
  });

  it("returns the correct config for builder (Scale) tier", () => {
    const ent = getEntitlements("builder");
    expect(ent.runsPerMonth).toBe(2000);
    expect(ent.runHistoryDays).toBe(365);
    expect(ent.priorityExecution).toBe(true);
    expect(ent.maxTeamSeats).toBeNull();
    expect(ent.modelCreditsIncluded).toBe(true);
  });

  it("unlimited: all null/true", () => {
    const ent = getEntitlements("unlimited");
    expect(ent.maxPrograms).toBeNull();
    expect(ent.runsPerMonth).toBeNull();
    expect(ent.runHistoryDays).toBeNull();
    expect(ent.genesisUsesPerMonth).toBeNull();
    expect(ent.byok).toBe(true);
    expect(ent.hitlApprovals).toBe(true);
    expect(ent.conflictDetection).toBe(true);
    expect(ent.priorityExecution).toBe(true);
    expect(ent.maxTeamSeats).toBeNull();
  });
});

// ─── hasTriggerAccess ─────────────────────────────────────────────────────────

describe("hasTriggerAccess", () => {
  const triggerTypes: TriggerType[] = ["manual", "cron", "webhook", "event", "program"];

  it("free: only manual and cron return true", () => {
    expect(hasTriggerAccess("free", "manual")).toBe(true);
    expect(hasTriggerAccess("free", "cron")).toBe(true);
    expect(hasTriggerAccess("free", "webhook")).toBe(false);
    expect(hasTriggerAccess("free", "event")).toBe(false);
    expect(hasTriggerAccess("free", "program")).toBe(false);
  });

  it("plus: manual, cron, webhook true; event, program false", () => {
    expect(hasTriggerAccess("plus", "webhook")).toBe(true);
    expect(hasTriggerAccess("plus", "event")).toBe(false);
    expect(hasTriggerAccess("plus", "program")).toBe(false);
  });

  it("pro and builder: all trigger types true", () => {
    for (const t of triggerTypes) {
      expect(hasTriggerAccess("pro", t)).toBe(true);
      expect(hasTriggerAccess("builder", t)).toBe(true);
      expect(hasTriggerAccess("unlimited", t)).toBe(true);
    }
  });
});

// ─── ENTITLEMENTS completeness ────────────────────────────────────────────────

describe("ENTITLEMENTS record", () => {
  const tiers: Tier[] = ["free", "plus", "pro", "builder", "unlimited"];

  it("defines all tiers", () => {
    for (const tier of tiers) {
      expect(ENTITLEMENTS[tier]).toBeDefined();
    }
  });

  it("runsPerMonth increases as tier increases (or is null)", () => {
    const freeRuns = ENTITLEMENTS.free.runsPerMonth!;
    const plusRuns = ENTITLEMENTS.plus.runsPerMonth!;
    const proRuns = ENTITLEMENTS.pro.runsPerMonth!;
    const builderRuns = ENTITLEMENTS.builder.runsPerMonth!;

    expect(freeRuns).toBeLessThan(plusRuns);
    expect(plusRuns).toBeLessThan(proRuns);
    expect(proRuns).toBeLessThan(builderRuns);
    expect(ENTITLEMENTS.unlimited.runsPerMonth).toBeNull();
  });

  it("runHistoryDays increases as tier increases (or is null)", () => {
    expect(ENTITLEMENTS.free.runHistoryDays!).toBeLessThan(ENTITLEMENTS.plus.runHistoryDays!);
    expect(ENTITLEMENTS.plus.runHistoryDays!).toBeLessThan(ENTITLEMENTS.pro.runHistoryDays!);
    expect(ENTITLEMENTS.pro.runHistoryDays!).toBeLessThan(ENTITLEMENTS.builder.runHistoryDays!);
    expect(ENTITLEMENTS.unlimited.runHistoryDays).toBeNull();
  });

  it("free is the only tier with genesisUsesPerMonth !== null", () => {
    expect(ENTITLEMENTS.free.genesisUsesPerMonth).not.toBeNull();
    expect(ENTITLEMENTS.plus.genesisUsesPerMonth).toBeNull();
    expect(ENTITLEMENTS.pro.genesisUsesPerMonth).toBeNull();
    expect(ENTITLEMENTS.builder.genesisUsesPerMonth).toBeNull();
    expect(ENTITLEMENTS.unlimited.genesisUsesPerMonth).toBeNull();
  });

  it("free and plus are the only tiers with maxPrograms !== null", () => {
    expect(ENTITLEMENTS.free.maxPrograms).not.toBeNull();
    expect(ENTITLEMENTS.plus.maxPrograms).not.toBeNull();
    expect(ENTITLEMENTS.pro.maxPrograms).toBeNull();
    expect(ENTITLEMENTS.builder.maxPrograms).toBeNull();
    expect(ENTITLEMENTS.unlimited.maxPrograms).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  assessGovernanceMaturity,
  buildInventoryRecordFromProgram,
  buildRemediationActions,
  calculateGovernanceMetrics,
  classifyAiActRisk,
} from "@/lib/compliance/governance";

describe("compliance governance", () => {
  it("classifies employment candidate scoring as high risk", () => {
    const result = classifyAiActRisk({
      systemName: "Candidate screening",
      employmentDecisions: true,
      candidateScoring: true,
      automatedDecisionMaking: true,
    });

    expect(result.riskCategory).toBe("High Risk");
    expect(result.requiredControls).toContain("Human oversight required");
    expect(result.requiredControls).toContain("Documentation required");
  });

  it("prioritizes potentially prohibited signals", () => {
    const result = classifyAiActRisk({
      systemName: "Scoring",
      socialScoring: true,
      userProfiling: true,
    });

    expect(result.riskCategory).toBe("Potentially Prohibited Use");
    expect(result.recommendations[0]).toContain("Do not deploy");
  });

  it("flags newly added prohibited-use signals", () => {
    for (const key of [
      "untargetedFacialScraping",
      "predictivePolicingProfiling",
      "biometricCategorizationSensitive",
      "exploitsVulnerabilities",
    ] as const) {
      const result = classifyAiActRisk({ systemName: "Test", [key]: true });
      expect(result.riskCategory).toBe("Potentially Prohibited Use");
    }
  });

  it("flags newly added Annex III high-risk domains", () => {
    for (const key of [
      "criticalInfrastructure",
      "migrationBorderControl",
      "justiceOrDemocraticProcess",
    ] as const) {
      const result = classifyAiActRisk({ systemName: "Test", [key]: true });
      expect(result.riskCategory).toBe("High Risk");
    }
  });

  it("builds inventory metrics from workflow records", () => {
    const record = buildInventoryRecordFromProgram({
      program: {
        id: "12345678-1234-1234-1234-123456789012",
        name: "Support triage",
        description: "Classifies customer email.",
        is_active: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        ai_use_case_category: "Customer support",
        ai_act_risk_level: "transparency",
        human_oversight_required: true,
        high_risk_documentation_required: false,
        reviewer: null,
        reviewed_at: null,
        ai_act_notes: null,
      },
      creatorEmail: "owner@example.com",
    });

    const metrics = calculateGovernanceMetrics([record]);
    expect(record.system_id).toBe("sys_12345678");
    expect(record.personal_data_processed).toBe("Yes");
    expect(metrics.total_ai_systems).toBe(1);
    expect(metrics.systems_due_for_review).toBe(1);
  });

  it("scores governance maturity", () => {
    const result = assessGovernanceMaturity({
      inventoryCoverage: true,
      riskClassification: true,
      documentationGenerated: true,
      dpiaWorkflow: false,
      immutableAuditLogs: true,
      humanOversight: true,
      monitoringCadence: false,
      incidentResponse: false,
    });

    expect(result.score).toBe(63);
    expect(result.level).toBe("Developing");
    expect(result.nextActions).toContain("Add DPIA draft, review, and approval workflow.");
  });

  it("surfaces transparency notice remediation for transparency workflows", () => {
    const record = buildInventoryRecordFromProgram({
      program: {
        id: "aaaaaaaa-1234-1234-1234-123456789012",
        name: "AI support assistant",
        description: "Lets customers interact with an AI support assistant.",
        is_active: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        ai_act_risk_level: "transparency",
        transparency_notice_required: false,
      },
    });

    expect(buildRemediationActions([record]).map((action) => action.id)).toContain(
      "transparency-notice"
    );
  });

  it("surfaces high-risk retention and conditional FRIA review actions", () => {
    const record = buildInventoryRecordFromProgram({
      program: {
        id: "bbbbbbbb-1234-1234-1234-123456789012",
        name: "Candidate screening",
        description: "Scores employment candidates.",
        is_active: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        ai_act_risk_level: "high_risk",
      },
    });

    const actionIds = buildRemediationActions([record], {
      executionLogRetentionDays: 90,
    }).map((action) => action.id);

    expect(actionIds).toContain("high-risk-log-retention");
    expect(actionIds).toContain("fria-applicability-review");
  });
});

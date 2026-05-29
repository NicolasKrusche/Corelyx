import type { ProgramSchema } from "@flowos/schema";
import type {
  AiActRiskLevel,
  DataFlowPreviewItem,
} from "@/lib/compliance/workflow";

export type PublicRiskCategory =
  | "Minimal Risk"
  | "Limited Risk"
  | "High Risk"
  | "Potentially Prohibited Use";

export type AiActAssessmentInput = {
  systemName?: string;
  description?: string;
  employmentDecisions?: boolean;
  candidateScoring?: boolean;
  educationalDecisions?: boolean;
  creditworthinessDecisions?: boolean;
  healthcareDecisions?: boolean;
  biometricProcessing?: boolean;
  lawEnforcementUse?: boolean;
  automatedDecisionMaking?: boolean;
  userProfiling?: boolean;
  vulnerableGroups?: boolean;
  manipulativeOrDeceptiveUse?: boolean;
  socialScoring?: boolean;
  emotionRecognitionWorkplaceOrEducation?: boolean;
  untargetedFacialScraping?: boolean;
  predictivePolicingProfiling?: boolean;
  biometricCategorizationSensitive?: boolean;
  exploitsVulnerabilities?: boolean;
  criticalInfrastructure?: boolean;
  migrationBorderControl?: boolean;
  justiceOrDemocraticProcess?: boolean;
};

export type AiActAssessmentResult = {
  riskCategory: PublicRiskCategory;
  classificationConfidence: number;
  reasoning: string[];
  applicableObligations: string[];
  requiredControls: string[];
  recommendations: string[];
  disclaimer: string;
};

export type AiSystemInventoryRecord = {
  system_id: string;
  name: string;
  description: string;
  department: string;
  business_owner: string;
  technical_owner: string;
  purpose: string;
  models_used: string[];
  data_sources: string[];
  personal_data_processed: "Yes" | "No" | "Unknown";
  special_category_data_processed: "Yes" | "No" | "Unknown";
  deployment_status: string;
  creation_date: string;
  last_review_date: string | null;
  risk_classification: PublicRiskCategory | "Unknown";
  human_oversight_status: string;
  documentation_status: "Complete" | "Partial" | "Missing";
  dpia_status: "Not required" | "Draft recommended" | "Required" | "Completed";
  review_due: boolean;
};

export type GovernanceDashboardMetrics = {
  total_ai_systems: number;
  high_risk_systems: number;
  systems_lacking_documentation: number;
  systems_lacking_oversight: number;
  systems_due_for_review: number;
  dpia_required_or_recommended: number;
  documentation_coverage_percent: number;
  oversight_coverage_percent: number;
  risk_distribution: Record<PublicRiskCategory | "Unknown", number>;
};

export type ProgramInventorySource = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  schema_version?: number | null;
  ai_use_case_category?: string | null;
  ai_act_risk_level?: AiActRiskLevel | null;
  human_oversight_required?: boolean | null;
  high_risk_documentation_required?: boolean | null;
  reviewer?: string | null;
  reviewed_at?: string | null;
  ai_act_notes?: string | null;
};

export type DpiaDraftInput = {
  systemName: string;
  processingPurpose: string;
  dataCategories: string[];
  dataSubjects: string[];
  personalDataUsage: string;
  automatedDecisionMaking: boolean;
  thirdPartyProviders: string[];
  mitigations?: string[];
  residualRisks?: string[];
};

export type MaturityAssessmentInput = {
  inventoryCoverage: boolean;
  riskClassification: boolean;
  documentationGenerated: boolean;
  dpiaWorkflow: boolean;
  immutableAuditLogs: boolean;
  humanOversight: boolean;
  monitoringCadence: boolean;
  incidentResponse: boolean;
};

export type MaturityAssessmentResult = {
  score: number;
  level: "Initial" | "Developing" | "Managed" | "Advanced";
  strengths: string[];
  gaps: string[];
  nextActions: string[];
};

const DISCLAIMER =
  "This is a governance support assessment, not legal advice. Final classification and obligations should be reviewed by qualified legal and compliance owners.";

const HIGH_RISK_OBLIGATIONS = [
  "Maintain risk-management and quality controls for the AI system.",
  "Keep technical documentation and instructions for use current.",
  "Enable logging, monitoring, and post-market review.",
  "Define effective human oversight before consequential action.",
  "Track data governance, accuracy, robustness, and cybersecurity controls.",
];

const LIMITED_RISK_OBLIGATIONS = [
  "Provide transparency notices where users interact with AI-generated or AI-assisted output.",
  "Keep basic system purpose, model, data-source, and owner documentation.",
  "Monitor for escalation into high-risk or prohibited use.",
];

const PROHIBITED_RECOMMENDATIONS = [
  "Do not deploy until legal review confirms the use is permitted.",
  "Block production activation by default.",
  "Record classification rationale and executive/legal approval if reviewed further.",
];

function compact(value: Array<string | null | undefined>) {
  return value.map((item) => item?.trim()).filter(Boolean) as string[];
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))];
}

function splitList(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return unique(value);
  if (!value) return [];
  return unique(value.split(/[,;\n]/).map((item) => item.trim()));
}

export function mapAiActRiskToPublicCategory(
  risk: AiActRiskLevel | null | undefined
): PublicRiskCategory | "Unknown" {
  if (risk === "prohibited") return "Potentially Prohibited Use";
  if (risk === "high_risk") return "High Risk";
  if (risk === "transparency" || risk === "gpai_related") return "Limited Risk";
  if (risk === "limited_or_minimal") return "Minimal Risk";
  return "Unknown";
}

export function classifyAiActRisk(input: AiActAssessmentInput): AiActAssessmentResult {
  const prohibitedSignals = compact([
    input.socialScoring ? "social scoring or public-authority-style scoring" : null,
    input.manipulativeOrDeceptiveUse ? "manipulative or deceptive use" : null,
    input.emotionRecognitionWorkplaceOrEducation
      ? "emotion recognition in workplace or education"
      : null,
    input.biometricProcessing && input.lawEnforcementUse
      ? "real-time/remote biometric identification in a law-enforcement context"
      : null,
    input.untargetedFacialScraping
      ? "untargeted scraping of facial images to build recognition databases"
      : null,
    input.predictivePolicingProfiling
      ? "predicting criminal offences based solely on profiling"
      : null,
    input.biometricCategorizationSensitive
      ? "biometric categorisation that infers sensitive attributes"
      : null,
    input.exploitsVulnerabilities
      ? "exploiting age, disability, or socio-economic vulnerabilities"
      : null,
  ]);

  const highRiskSignals = compact([
    input.employmentDecisions ? "employment or worker-management decisions" : null,
    input.candidateScoring ? "candidate scoring or recruitment ranking" : null,
    input.educationalDecisions ? "educational access, assessment, or progression decisions" : null,
    input.creditworthinessDecisions ? "creditworthiness or credit-score decisions" : null,
    input.healthcareDecisions ? "healthcare, medical, or safety-impacting decisions" : null,
    input.biometricProcessing ? "biometric identification or categorisation" : null,
    input.lawEnforcementUse ? "law-enforcement use" : null,
    input.criticalInfrastructure ? "safety component of critical infrastructure" : null,
    input.migrationBorderControl ? "migration, asylum, or border-control management" : null,
    input.justiceOrDemocraticProcess ? "administration of justice or democratic processes" : null,
    input.automatedDecisionMaking ? "automated decision-making with material impact" : null,
    input.vulnerableGroups ? "use involving vulnerable groups" : null,
  ]);

  const limitedRiskSignals = compact([
    input.userProfiling ? "user profiling or personalisation" : null,
    input.description?.toLowerCase().includes("chatbot") ? "AI interaction disclosure" : null,
  ]);

  if (prohibitedSignals.length > 0) {
    return {
      riskCategory: "Potentially Prohibited Use",
      classificationConfidence: Math.min(0.92, 0.76 + prohibitedSignals.length * 0.04),
      reasoning: prohibitedSignals.map((signal) => `Potential prohibited-use signal: ${signal}.`),
      applicableObligations: [
        "Legal review before deployment.",
        "Production block until the use case is confirmed as permitted.",
        "Document classification rationale, reviewer, and final decision.",
      ],
      requiredControls: [
        "Deployment block",
        "Legal approval",
        "Executive risk acceptance if reviewed further",
        "Immutable audit record",
      ],
      recommendations: PROHIBITED_RECOMMENDATIONS,
      disclaimer: DISCLAIMER,
    };
  }

  if (highRiskSignals.length > 0) {
    return {
      riskCategory: "High Risk",
      classificationConfidence: Math.min(0.9, 0.68 + highRiskSignals.length * 0.035),
      reasoning: highRiskSignals.map((signal) => `High-risk signal: ${signal}.`),
      applicableObligations: HIGH_RISK_OBLIGATIONS,
      requiredControls: [
        "Human oversight required",
        "Logging required",
        "Documentation required",
        "Monitoring required",
        "Legal review required",
      ],
      recommendations: [
        "Add approval gates before consequential actions.",
        "Generate technical documentation and DPIA/FRA working papers.",
        "Record model, data-source, owner, reviewer, and review cadence.",
        "Monitor post-deployment outcomes and override actions.",
      ],
      disclaimer: DISCLAIMER,
    };
  }

  if (limitedRiskSignals.length > 0) {
    return {
      riskCategory: "Limited Risk",
      classificationConfidence: 0.7,
      reasoning: limitedRiskSignals.map((signal) => `Limited-risk signal: ${signal}.`),
      applicableObligations: LIMITED_RISK_OBLIGATIONS,
      requiredControls: [
        "Transparency notice recommended",
        "Basic logging required",
        "Documentation recommended",
        "Periodic review recommended",
      ],
      recommendations: [
        "Show users when they are interacting with AI-assisted output.",
        "Keep inventory and documentation current.",
        "Escalate to legal review if the workflow begins making consequential decisions.",
      ],
      disclaimer: DISCLAIMER,
    };
  }

  return {
    riskCategory: "Minimal Risk",
    classificationConfidence: 0.64,
    reasoning: [
      "No high-risk or prohibited-use signal was selected.",
      "The workflow should still be inventoried, documented, monitored, and reviewed.",
    ],
    applicableObligations: [
      "Maintain a basic AI inventory record.",
      "Keep proportionate documentation and user-facing transparency where relevant.",
    ],
    requiredControls: [
      "Inventory record",
      "Basic audit logging",
      "Periodic review",
    ],
    recommendations: [
      "Record model, data source, owner, and purpose.",
      "Set a review cadence and monitor for scope creep.",
    ],
    disclaimer: DISCLAIMER,
  };
}

function metadata(schema?: ProgramSchema | null): Record<string, unknown> {
  return schema?.metadata && typeof schema.metadata === "object"
    ? (schema.metadata as unknown as Record<string, unknown>)
    : {};
}

function readText(meta: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function modelsFromSchema(schema?: ProgramSchema | null) {
  return unique(
    (schema?.nodes ?? [])
      .filter((node) => node.type === "agent")
      .map((node) => (node.type === "agent" ? node.config.model : null))
      .filter((value): value is string => Boolean(value && value !== "__USER_ASSIGNED__"))
  );
}

function dataSourcesFromSchema(schema?: ProgramSchema | null, flow: DataFlowPreviewItem[] = []) {
  const flowSources = flow
    .filter((item) => item.provider.id !== "corelyx")
    .map((item) => item.provider.name);
  const nodeSources = (schema?.nodes ?? [])
    .filter((node) => node.type === "trigger" || node.type === "connection")
    .map((node) => node.connection ?? node.label);
  return unique([...flowSources, ...nodeSources]);
}

function inferSpecialCategory(program: ProgramInventorySource, flow: DataFlowPreviewItem[]) {
  const haystack = [
    program.name,
    program.description ?? "",
    program.ai_use_case_category ?? "",
    ...flow.flatMap((item) => item.data_categories),
  ]
    .join(" ")
    .toLowerCase();
  if (/(health|medical|patient|biometric|race|ethnic|religion|political|union|sexual|genetic)/.test(haystack)) {
    return "Yes";
  }
  if (flow.length === 0) return "Unknown";
  return "No";
}

function reviewDue(lastReviewDate: string | null) {
  if (!lastReviewDate) return true;
  const last = new Date(lastReviewDate).getTime();
  if (Number.isNaN(last)) return true;
  const days = (Date.now() - last) / 86_400_000;
  return days >= 180;
}

function documentationStatus(record: {
  description: string;
  purpose: string;
  business_owner: string;
  technical_owner: string;
  risk_classification: PublicRiskCategory | "Unknown";
  last_review_date: string | null;
}) {
  const checks = [
    record.description !== "No description provided.",
    record.purpose !== "Purpose not documented.",
    record.business_owner !== "Unassigned",
    record.technical_owner !== "Unassigned",
    record.risk_classification !== "Unknown",
    Boolean(record.last_review_date),
  ];
  const passed = checks.filter(Boolean).length;
  if (passed >= 5) return "Complete";
  if (passed >= 2) return "Partial";
  return "Missing";
}

function dpiaStatus(
  risk: PublicRiskCategory | "Unknown",
  personalData: "Yes" | "No" | "Unknown",
  specialCategory: "Yes" | "No" | "Unknown",
  notes?: string | null
) {
  if (notes && /dpia\s*:\s*(complete|completed|approved)/i.test(notes)) return "Completed";
  if (risk === "High Risk" || specialCategory === "Yes") return "Required";
  if (personalData === "Yes" || personalData === "Unknown") return "Draft recommended";
  return "Not required";
}

export function buildInventoryRecordFromProgram({
  program,
  schema,
  flow = [],
  creatorEmail,
}: {
  program: ProgramInventorySource;
  schema?: ProgramSchema | null;
  flow?: DataFlowPreviewItem[];
  creatorEmail?: string | null;
}): AiSystemInventoryRecord {
  const meta = metadata(schema);
  const risk = mapAiActRiskToPublicCategory(program.ai_act_risk_level);
  const models = unique([
    ...splitList(readText(meta, ["models_used", "models"], "")),
    ...modelsFromSchema(schema),
  ]);
  const sources = unique([
    ...splitList(readText(meta, ["data_sources"], "")),
    ...dataSourcesFromSchema(schema, flow),
  ]);
  const personalData =
    flow.some((item) => item.personal_data_may_be_processed) ||
    /personal|customer|candidate|employee|patient|email|profile/i.test(
      `${program.description ?? ""} ${program.ai_use_case_category ?? ""}`
    )
      ? "Yes"
      : flow.length === 0
        ? "Unknown"
        : "No";
  const specialCategory = inferSpecialCategory(program, flow);
  const ownerFallback = creatorEmail ?? "Unassigned";
  const base = {
    description: program.description?.trim() || "No description provided.",
    purpose:
      program.ai_use_case_category?.trim() ||
      readText(meta, ["purpose", "processing_purpose"], "Purpose not documented."),
    business_owner: readText(meta, ["business_owner", "owner"], ownerFallback),
    technical_owner: readText(meta, ["technical_owner"], ownerFallback),
    risk_classification: risk,
    last_review_date: program.reviewed_at ?? null,
  };

  const record: AiSystemInventoryRecord = {
    system_id: `sys_${program.id.slice(0, 8)}`,
    name: program.name,
    department: readText(meta, ["department"], "Unassigned"),
    models_used: models.length > 0 ? models : ["Not documented"],
    data_sources: sources.length > 0 ? sources : ["Not documented"],
    personal_data_processed: personalData,
    special_category_data_processed: specialCategory,
    deployment_status: program.is_active ? "Active" : "Draft or inactive",
    creation_date: program.created_at ?? program.updated_at ?? new Date().toISOString(),
    human_oversight_status: program.human_oversight_required
      ? "Required"
      : program.ai_act_risk_level === "high_risk"
        ? "Missing for high-risk workflow"
        : "Not marked as required",
    review_due: reviewDue(program.reviewed_at ?? null),
    documentation_status: "Missing",
    dpia_status: "Draft recommended",
    ...base,
  };

  record.documentation_status = documentationStatus(record);
  record.dpia_status = dpiaStatus(
    record.risk_classification,
    record.personal_data_processed,
    record.special_category_data_processed,
    program.ai_act_notes
  );
  return record;
}

export function calculateGovernanceMetrics(
  records: AiSystemInventoryRecord[]
): GovernanceDashboardMetrics {
  const risk_distribution: GovernanceDashboardMetrics["risk_distribution"] = {
    "Minimal Risk": 0,
    "Limited Risk": 0,
    "High Risk": 0,
    "Potentially Prohibited Use": 0,
    Unknown: 0,
  };

  for (const record of records) risk_distribution[record.risk_classification] += 1;

  const documented = records.filter((record) => record.documentation_status === "Complete").length;
  const oversightCovered = records.filter(
    (record) =>
      record.human_oversight_status === "Required" ||
      record.risk_classification === "Minimal Risk" ||
      record.risk_classification === "Limited Risk"
  ).length;

  return {
    total_ai_systems: records.length,
    high_risk_systems: records.filter(
      (record) =>
        record.risk_classification === "High Risk" ||
        record.risk_classification === "Potentially Prohibited Use"
    ).length,
    systems_lacking_documentation: records.filter(
      (record) => record.documentation_status !== "Complete"
    ).length,
    systems_lacking_oversight: records.filter((record) =>
      record.human_oversight_status.startsWith("Missing")
    ).length,
    systems_due_for_review: records.filter((record) => record.review_due).length,
    dpia_required_or_recommended: records.filter(
      (record) => record.dpia_status === "Required" || record.dpia_status === "Draft recommended"
    ).length,
    documentation_coverage_percent:
      records.length === 0 ? 100 : Math.round((documented / records.length) * 100),
    oversight_coverage_percent:
      records.length === 0 ? 100 : Math.round((oversightCovered / records.length) * 100),
    risk_distribution,
  };
}

export function generateTechnicalDocumentation(record: AiSystemInventoryRecord) {
  return `# Technical Documentation: ${record.name}

## System purpose
${record.purpose}

## Architecture
Corelyx represents this AI system as a governed workflow graph. The editor graph is translated into a validated workflow schema, then executed by the runtime with run-level evidence and approval records.

## Models used
${record.models_used.map((model) => `- ${model}`).join("\n")}

## Data flows
Data sources:
${record.data_sources.map((source) => `- ${source}`).join("\n")}

Personal data processed: ${record.personal_data_processed}
Special category data processed: ${record.special_category_data_processed}

## Training information
Customer workflow execution does not imply model training by Corelyx. Model-provider training behavior must be reviewed against the configured provider and workspace policy.

## Evaluation methods
- Confirm workflow schema validation before publication.
- Review risk classification and owner fields.
- Test approval gates for high-impact actions.
- Review audit logs after representative runs.

## Known limitations
- Automated classification is a governance aid and must be reviewed by accountable owners.
- Model output may be inaccurate or incomplete.
- Third-party provider obligations depend on the configured connector and model provider.

## Human oversight process
${record.human_oversight_status}. High-impact actions should pause for reviewer approval before external side effects occur.

## Monitoring process
Review run logs, policy-check results, approval decisions, failures, overrides, and provider changes at least every 180 days.

## Incident response process
Suspend the workflow, preserve relevant logs, notify business and technical owners, assess data-protection impact, document mitigations, and record the final decision.

## Version control
Documentation is generated from the current inventory record and workflow schema. Changes should be tracked through Corelyx program versions and exported evidence packs.
`;
}

export function generateDpiaDraft(input: DpiaDraftInput) {
  const mitigations = input.mitigations?.length
    ? input.mitigations
    : [
        "Minimise personal data before AI/model calls.",
        "Use human approval before consequential actions.",
        "Restrict access to workflow logs and generated reports.",
        "Retain prompts and outputs only where necessary.",
        "Record model/provider metadata and reviewer decisions.",
      ];
  const residualRisks = input.residualRisks?.length
    ? input.residualRisks
    : [
        "Model output may be inaccurate or biased.",
        "Data-source quality may affect recommendations.",
        "Third-party provider configuration may change.",
      ];

  return `# DPIA Draft: ${input.systemName}

## Purpose
${input.processingPurpose}

## Data categories
${input.dataCategories.map((category) => `- ${category}`).join("\n")}

## Data subjects
${input.dataSubjects.map((subject) => `- ${subject}`).join("\n")}

## Personal data usage
${input.personalDataUsage}

## Automated decision-making
${input.automatedDecisionMaking ? "Automated decision-making may be involved. Human review and legal assessment are required before consequential action." : "No solely automated consequential decision-making is documented in this draft."}

## Third-party providers
${input.thirdPartyProviders.length ? input.thirdPartyProviders.map((provider) => `- ${provider}`).join("\n") : "- Not documented"}

## Necessity assessment
The processing should be limited to data necessary for the documented workflow purpose. Each node should have a defined input, output, retention need, and owner.

## Proportionality assessment
The workflow should use the least intrusive data source, minimise prompt content, avoid unnecessary special-category data, and provide human oversight where the output affects people.

## Risk analysis
- Unnecessary personal-data exposure in prompts or connector payloads.
- Inaccurate, biased, or poorly explained AI recommendations.
- Excessive retention of prompts, outputs, or decision evidence.
- Insufficient review before customer, employee, patient, or candidate impact.

## Mitigation measures
${mitigations.map((item) => `- ${item}`).join("\n")}

## Residual risks
${residualRisks.map((item) => `- ${item}`).join("\n")}

## Approval workflow
Business owner, technical owner, privacy/compliance reviewer, and legal reviewer should approve this DPIA before production deployment when high risk remains.
`;
}

export function generateInventoryMarkdown(records: AiSystemInventoryRecord[]) {
  return `# AI Inventory

${records
  .map(
    (record) => `## ${record.name}

- System ID: ${record.system_id}
- Department: ${record.department}
- Business owner: ${record.business_owner}
- Technical owner: ${record.technical_owner}
- Purpose: ${record.purpose}
- Models used: ${record.models_used.join(", ")}
- Data sources: ${record.data_sources.join(", ")}
- Personal data processed: ${record.personal_data_processed}
- Special category data processed: ${record.special_category_data_processed}
- Deployment status: ${record.deployment_status}
- Risk classification: ${record.risk_classification}
- Human oversight status: ${record.human_oversight_status}
- Documentation status: ${record.documentation_status}
- DPIA status: ${record.dpia_status}
- Last review date: ${record.last_review_date ?? "Never"}
`
  )
  .join("\n")}
`;
}

export function assessGovernanceMaturity(input: MaturityAssessmentInput): MaturityAssessmentResult {
  const checks: Array<[keyof MaturityAssessmentInput, string, string]> = [
    ["inventoryCoverage", "AI systems are centrally inventoried.", "Create a complete AI inventory."],
    ["riskClassification", "AI Act risk classification is applied.", "Classify every AI system by risk category."],
    ["documentationGenerated", "Documentation is generated and maintained.", "Generate technical documentation from inventory records."],
    ["dpiaWorkflow", "DPIA workflow exists for personal-data processing.", "Add DPIA draft, review, and approval workflow."],
    ["immutableAuditLogs", "Audit logs are immutable and searchable.", "Make AI actions and approvals immutable and searchable."],
    ["humanOversight", "Human oversight is operationalized.", "Add approval gates before critical actions."],
    ["monitoringCadence", "Review cadence is defined.", "Set review due dates and monitoring cadence."],
    ["incidentResponse", "Incident process is documented.", "Document AI incident response and escalation steps."],
  ];

  const passed = checks.filter(([key]) => input[key]).length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    score,
    level: score >= 85 ? "Advanced" : score >= 65 ? "Managed" : score >= 40 ? "Developing" : "Initial",
    strengths: checks.filter(([key]) => input[key]).map(([, strength]) => strength),
    gaps: checks.filter(([key]) => !input[key]).map(([, , gap]) => gap),
    nextActions: checks.filter(([key]) => !input[key]).slice(0, 4).map(([, , gap]) => gap),
  };
}

export function buildDpiaInputFromInventory(record: AiSystemInventoryRecord): DpiaDraftInput {
  return {
    systemName: record.name,
    processingPurpose: record.purpose,
    dataCategories: [
      record.personal_data_processed === "Yes" ? "Personal data" : "Workflow metadata",
      record.special_category_data_processed === "Yes" ? "Special category data" : "No special category data documented",
    ],
    dataSubjects: ["Customers, employees, candidates, users, or other affected people as configured by the customer"],
    personalDataUsage: `${record.name} processes data for: ${record.purpose}`,
    automatedDecisionMaking: record.risk_classification === "High Risk",
    thirdPartyProviders: record.data_sources,
  };
}


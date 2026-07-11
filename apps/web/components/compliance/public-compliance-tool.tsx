"use client";

import { useEffect, useMemo, useState } from "react";
import {
  assessGovernanceMaturity,
  classifyAiActRisk,
  generateDpiaDraft,
  generateTechnicalDocumentation,
  type AiSystemInventoryRecord,
  type PublicRiskCategory,
} from "@/lib/compliance/governance";
import type { PublicComplianceToolSlug } from "@/lib/compliance/tool-definitions";
import { cn } from "@/lib/utils";

function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-border bg-card p-5", className)}>{children}</section>;
}

// Generated reports embed these values verbatim — bound them so a pasted
// novel can't produce megabyte-sized reports or hang the preview.
const TEXT_FIELD_MAX_LENGTH = 200;
const TEXT_AREA_MAX_LENGTH = 2000;

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={TEXT_FIELD_MAX_LENGTH}
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        maxLength={TEXT_AREA_MAX_LENGTH}
        className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function ReportActions({
  slug,
  report,
  json,
}: {
  slug: string;
  report: string;
  json: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const [linked, setLinked] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyShareLink() {
    const bytes = new TextEncoder().encode(report);
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#report=${encoded}`);
    setLinked(true);
    window.setTimeout(() => setLinked(false), 1500);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => download(`${slug}-report.md`, report, "text/markdown;charset=utf-8")}
        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Download Markdown
      </button>
      <button
        type="button"
        onClick={() => download(`${slug}-report.json`, JSON.stringify(json, null, 2), "application/json;charset=utf-8")}
        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
      >
        Download JSON
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
      >
        {copied ? "Copied" : "Copy report"}
      </button>
      <button
        type="button"
        onClick={() => void copyShareLink()}
        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
      >
        {linked ? "Link copied" : "Copy share link"}
      </button>
    </div>
  );
}

function AiActRiskClassifier() {
  const [state, setState] = useState({
    systemName: "AI candidate screening workflow",
    description: "AI ranks incoming candidate applications and recommends next steps.",
    employmentDecisions: true,
    candidateScoring: true,
    educationalDecisions: false,
    creditworthinessDecisions: false,
    healthcareDecisions: false,
    biometricProcessing: false,
    lawEnforcementUse: false,
    automatedDecisionMaking: true,
    userProfiling: true,
    vulnerableGroups: false,
    manipulativeOrDeceptiveUse: false,
    socialScoring: false,
    emotionRecognitionWorkplaceOrEducation: false,
    untargetedFacialScraping: false,
    predictivePolicingProfiling: false,
    biometricCategorizationSensitive: false,
    exploitsVulnerabilities: false,
    criticalInfrastructure: false,
    migrationBorderControl: false,
    justiceOrDemocraticProcess: false,
  });

  const result = useMemo(() => classifyAiActRisk(state), [state]);
  const report = `# AI Act Risk Assessment: ${state.systemName}

Risk category: ${result.riskCategory}
Signal strength: ${Math.round(result.classificationConfidence * 100)}% (indicative, based only on the answers provided — not a legal determination)

## Reasoning
${result.reasoning.map((item) => `- ${item}`).join("\n")}

## Applicable obligations
${result.applicableObligations.map((item) => `- ${item}`).join("\n")}

## Required controls
${result.requiredControls.map((item) => `- ${item}`).join("\n")}

## Recommendations
${result.recommendations.map((item) => `- ${item}`).join("\n")}

${result.disclaimer}
`;

  const checkboxEntries = [
    ["employmentDecisions", "Employment or worker-management decisions"],
    ["candidateScoring", "Candidate scoring or recruitment ranking"],
    ["educationalDecisions", "Education access, assessment, or progression"],
    ["creditworthinessDecisions", "Creditworthiness or credit-score decisions"],
    ["healthcareDecisions", "Healthcare, medical, or safety-impacting decisions"],
    ["biometricProcessing", "Biometric identification or categorisation"],
    ["lawEnforcementUse", "Law-enforcement use"],
    ["automatedDecisionMaking", "Automated decisions with material impact"],
    ["userProfiling", "User profiling or personalisation"],
    ["vulnerableGroups", "Vulnerable groups"],
    ["manipulativeOrDeceptiveUse", "Manipulative or deceptive use"],
    ["socialScoring", "Social scoring"],
    ["emotionRecognitionWorkplaceOrEducation", "Emotion recognition in workplace or education"],
    ["exploitsVulnerabilities", "Exploits age, disability, or socio-economic vulnerabilities"],
    ["untargetedFacialScraping", "Untargeted scraping of facial images"],
    ["predictivePolicingProfiling", "Predicting crime based solely on profiling"],
    ["biometricCategorizationSensitive", "Biometric categorisation of sensitive attributes"],
    ["criticalInfrastructure", "Safety component of critical infrastructure"],
    ["migrationBorderControl", "Migration, asylum, or border control"],
    ["justiceOrDemocraticProcess", "Administration of justice or democratic processes"],
  ] as const;

  return (
    <ToolLayout
      form={
        <>
          <TextField label="System name" value={state.systemName} onChange={(value) => setState((s) => ({ ...s, systemName: value }))} />
          <TextArea label="Description" value={state.description} onChange={(value) => setState((s) => ({ ...s, description: value }))} />
          <div className="grid gap-2 sm:grid-cols-2">
            {checkboxEntries.map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={Boolean(state[key])}
                onChange={(value) => setState((s) => ({ ...s, [key]: value }))}
              />
            ))}
          </div>
        </>
      }
      result={
        <>
          <div className="rounded-lg border border-border bg-background/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk category</p>
            <p className="mt-2 text-2xl font-black">{result.riskCategory}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {Math.round(result.classificationConfidence * 100)}% indicative signal strength
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
              Based only on the answers provided. This is governance support, not a legal determination.
            </p>
          </div>
          <ReportPreview report={report} />
          <ReportActions slug="ai-act-risk-classifier" report={report} json={{ input: state, result }} />
        </>
      }
    />
  );
}

// creation_date must be identical between server render and client hydration —
// a live `new Date()` here caused React hydration mismatches on the tool pages.
// Callers pass a date that is only set after mount.
function inventoryRecordFromState(creationDate: string | null, state: {
  name: string;
  description: string;
  department: string;
  businessOwner: string;
  technicalOwner: string;
  purpose: string;
  modelsUsed: string;
  dataSources: string;
  personalData: "Yes" | "No" | "Unknown";
  specialCategoryData: "Yes" | "No" | "Unknown";
  deploymentStatus: string;
  risk: PublicRiskCategory | "Unknown";
  humanOversight: string;
}) {
  const record: AiSystemInventoryRecord = {
    system_id: `sys_${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "ai_system"}`,
    name: state.name,
    description: state.description || "No description provided.",
    department: state.department || "Unassigned",
    business_owner: state.businessOwner || "Unassigned",
    technical_owner: state.technicalOwner || "Unassigned",
    purpose: state.purpose || "Purpose not documented.",
    models_used: splitList(state.modelsUsed).length ? splitList(state.modelsUsed) : ["Not documented"],
    data_sources: splitList(state.dataSources).length ? splitList(state.dataSources) : ["Not documented"],
    personal_data_processed: state.personalData,
    special_category_data_processed: state.specialCategoryData,
    deployment_status: state.deploymentStatus || "Draft",
    creation_date: creationDate ?? "Pending (set on export)",
    last_review_date: null,
    ai_act_risk_level: null,
    risk_classification: state.risk,
    has_approval_gate: false,
    human_oversight_status: state.humanOversight || "Not documented",
    transparency_notice_required: false,
    high_risk_documentation_required: false,
    documentation_status: "Partial",
    dpia_status:
      state.specialCategoryData === "Yes" ||
      (state.risk === "High Risk" && state.personalData !== "No")
        ? "Required"
        : state.personalData === "Yes"
          ? "Draft recommended"
          : "Not required",
    review_due: true,
  };
  return record;
}

// Returns null on the server and during hydration, then the real timestamp
// after mount — keeps server and client markup identical.
function useClientCreationDate(): string | null {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    setDate(new Date().toISOString());
  }, []);
  return date;
}

function InventoryGenerator() {
  const creationDate = useClientCreationDate();
  const [state, setState] = useState({
    name: "AI customer support triage",
    description: "Classifies inbound support messages and drafts internal recommendations.",
    department: "Support",
    businessOwner: "Head of Support",
    technicalOwner: "Automation team",
    purpose: "Route support requests faster while preserving human review.",
    modelsUsed: "GPT-4.1, Claude",
    dataSources: "Support inbox, CRM",
    personalData: "Yes" as const,
    specialCategoryData: "Unknown" as const,
    deploymentStatus: "Draft",
    risk: "Limited Risk" as PublicRiskCategory | "Unknown",
    humanOversight: "Required before customer-facing response",
  });
  const record = useMemo(() => inventoryRecordFromState(creationDate, state), [creationDate, state]);
  const report = `# AI Inventory Record: ${record.name}

${Object.entries(record)
  .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
  .join("\n")}
`;

  return (
    <ToolLayout
      form={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={state.name} onChange={(value) => setState((s) => ({ ...s, name: value }))} />
            <TextField label="Department" value={state.department} onChange={(value) => setState((s) => ({ ...s, department: value }))} />
            <TextField label="Business owner" value={state.businessOwner} onChange={(value) => setState((s) => ({ ...s, businessOwner: value }))} />
            <TextField label="Technical owner" value={state.technicalOwner} onChange={(value) => setState((s) => ({ ...s, technicalOwner: value }))} />
          </div>
          <TextArea label="Description" value={state.description} onChange={(value) => setState((s) => ({ ...s, description: value }))} />
          <TextArea label="Purpose" value={state.purpose} onChange={(value) => setState((s) => ({ ...s, purpose: value }))} rows={3} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Models used" value={state.modelsUsed} onChange={(value) => setState((s) => ({ ...s, modelsUsed: value }))} />
            <TextField label="Data sources" value={state.dataSources} onChange={(value) => setState((s) => ({ ...s, dataSources: value }))} />
            <SelectField label="Personal data processed" value={state.personalData} values={["Yes", "No", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, personalData: value as typeof state.personalData }))} />
            <SelectField label="Special category data processed" value={state.specialCategoryData} values={["Yes", "No", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, specialCategoryData: value as typeof state.specialCategoryData }))} />
            <SelectField label="Risk classification" value={state.risk} values={["Minimal Risk", "Limited Risk", "High Risk", "Potentially Prohibited Use", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, risk: value as typeof state.risk }))} />
            <TextField label="Deployment status" value={state.deploymentStatus} onChange={(value) => setState((s) => ({ ...s, deploymentStatus: value }))} />
          </div>
          <TextField label="Human oversight status" value={state.humanOversight} onChange={(value) => setState((s) => ({ ...s, humanOversight: value }))} />
        </>
      }
      result={
        <>
          <ReportPreview report={report} />
          <ReportActions slug="ai-inventory-generator" report={report} json={record} />
        </>
      }
    />
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {values.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}

function DpiaGenerator() {
  const [state, setState] = useState({
    systemName: "AI customer support triage",
    processingPurpose: "Classify customer requests, draft internal recommendations, and route complex cases to support specialists.",
    dataCategories: "Name, email address, support message, account metadata",
    dataSubjects: "Customers, support agents",
    personalDataUsage: "The workflow uses message content to classify intent and generate an internal support summary.",
    automatedDecisionMaking: false,
    thirdPartyProviders: "Corelyx, model provider, support inbox provider",
  });
  const input = {
    systemName: state.systemName,
    processingPurpose: state.processingPurpose,
    dataCategories: splitList(state.dataCategories),
    dataSubjects: splitList(state.dataSubjects),
    personalDataUsage: state.personalDataUsage,
    automatedDecisionMaking: state.automatedDecisionMaking,
    thirdPartyProviders: splitList(state.thirdPartyProviders),
  };
  const report = generateDpiaDraft(input);

  return (
    <ToolLayout
      form={
        <>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Public preview only — nothing here is saved.</p>
            <p className="mt-1">
              This automatically generated draft is not attached to a workflow or account. To
              keep workflow-specific revisions, review changes, and record completion, sign in
              and use the workflow&apos;s DPIA page in Governance.
            </p>
          </div>
          <TextField label="System name" value={state.systemName} onChange={(value) => setState((s) => ({ ...s, systemName: value }))} />
          <TextArea label="Processing purpose" value={state.processingPurpose} onChange={(value) => setState((s) => ({ ...s, processingPurpose: value }))} />
          <TextField label="Data categories" value={state.dataCategories} onChange={(value) => setState((s) => ({ ...s, dataCategories: value }))} />
          <TextField label="Data subjects" value={state.dataSubjects} onChange={(value) => setState((s) => ({ ...s, dataSubjects: value }))} />
          <TextArea label="Personal data usage" value={state.personalDataUsage} onChange={(value) => setState((s) => ({ ...s, personalDataUsage: value }))} />
          <Checkbox label="Automated decision-making may be involved" checked={state.automatedDecisionMaking} onChange={(value) => setState((s) => ({ ...s, automatedDecisionMaking: value }))} />
          <TextField label="Third-party providers" value={state.thirdPartyProviders} onChange={(value) => setState((s) => ({ ...s, thirdPartyProviders: value }))} />
        </>
      }
      result={
        <>
          <ReportPreview report={report} />
          <ReportActions slug="dpia-generator" report={report} json={input} />
        </>
      }
    />
  );
}

function MaturityAssessment() {
  const [state, setState] = useState({
    inventoryCoverage: true,
    riskClassification: true,
    documentationGenerated: false,
    dpiaWorkflow: false,
    immutableAuditLogs: true,
    humanOversight: true,
    monitoringCadence: false,
    incidentResponse: false,
  });
  const result = assessGovernanceMaturity(state);
  const report = `# AI Governance Maturity Assessment

Score: ${result.score}
Level: ${result.level}

## Strengths
${result.strengths.map((item) => `- ${item}`).join("\n") || "- None selected yet."}

## Gaps
${result.gaps.map((item) => `- ${item}`).join("\n") || "- No major gaps selected."}

## Next actions
${result.nextActions.map((item) => `- ${item}`).join("\n") || "- Continue monitoring and testing."}
`;

  return (
    <ToolLayout
      form={
        <div className="grid gap-2">
          {Object.entries({
            inventoryCoverage: "AI systems are centrally inventoried",
            riskClassification: "AI Act risk classification is applied",
            documentationGenerated: "Technical documentation is generated and maintained",
            dpiaWorkflow: "DPIA workflow exists for personal-data processing",
            immutableAuditLogs: "Audit logs are immutable and searchable",
            humanOversight: "Human oversight is operationalized",
            monitoringCadence: "Review cadence and monitoring are defined",
            incidentResponse: "AI incident response is documented",
          }).map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={state[key as keyof typeof state]}
              onChange={(value) => setState((s) => ({ ...s, [key]: value }))}
            />
          ))}
        </div>
      }
      result={
        <>
          <div className="rounded-lg border border-border bg-background/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maturity score</p>
            <p className="mt-2 text-2xl font-black">{result.score}/100</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.level}</p>
          </div>
          <ReportPreview report={report} />
          <ReportActions slug="ai-governance-maturity-assessment" report={report} json={{ input: state, result }} />
        </>
      }
    />
  );
}

function DocumentationGenerator() {
  const creationDate = useClientCreationDate();
  const [state, setState] = useState({
    name: "AI sales email assistant",
    description: "Drafts outbound sales email suggestions for human review.",
    department: "Sales",
    businessOwner: "VP Sales",
    technicalOwner: "RevOps",
    purpose: "Accelerate drafting while keeping human approval before sending.",
    modelsUsed: "GPT-4.1",
    dataSources: "CRM, email templates",
    personalData: "Yes" as const,
    specialCategoryData: "No" as const,
    deploymentStatus: "Draft",
    risk: "Limited Risk" as PublicRiskCategory | "Unknown",
    humanOversight: "Human approval before sending",
  });
  const record = useMemo(() => inventoryRecordFromState(creationDate, state), [creationDate, state]);
  const report = generateTechnicalDocumentation(record);

  return (
    <ToolLayout
      form={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={state.name} onChange={(value) => setState((s) => ({ ...s, name: value }))} />
            <TextField label="Department" value={state.department} onChange={(value) => setState((s) => ({ ...s, department: value }))} />
            <TextField label="Business owner" value={state.businessOwner} onChange={(value) => setState((s) => ({ ...s, businessOwner: value }))} />
            <TextField label="Technical owner" value={state.technicalOwner} onChange={(value) => setState((s) => ({ ...s, technicalOwner: value }))} />
          </div>
          <TextArea label="Description" value={state.description} onChange={(value) => setState((s) => ({ ...s, description: value }))} />
          <TextArea label="Purpose" value={state.purpose} onChange={(value) => setState((s) => ({ ...s, purpose: value }))} rows={3} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Models used" value={state.modelsUsed} onChange={(value) => setState((s) => ({ ...s, modelsUsed: value }))} />
            <TextField label="Data sources" value={state.dataSources} onChange={(value) => setState((s) => ({ ...s, dataSources: value }))} />
            <SelectField label="Personal data processed" value={state.personalData} values={["Yes", "No", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, personalData: value as typeof state.personalData }))} />
            <SelectField label="Special category data processed" value={state.specialCategoryData} values={["Yes", "No", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, specialCategoryData: value as typeof state.specialCategoryData }))} />
            <SelectField label="Risk classification" value={state.risk} values={["Minimal Risk", "Limited Risk", "High Risk", "Potentially Prohibited Use", "Unknown"]} onChange={(value) => setState((s) => ({ ...s, risk: value as typeof state.risk }))} />
            <TextField label="Deployment status" value={state.deploymentStatus} onChange={(value) => setState((s) => ({ ...s, deploymentStatus: value }))} />
          </div>
          <TextField label="Human oversight status" value={state.humanOversight} onChange={(value) => setState((s) => ({ ...s, humanOversight: value }))} />
        </>
      }
      result={
        <>
          <ReportPreview report={report} />
          <ReportActions slug="compliance-documentation-generator" report={report} json={record} />
        </>
      }
    />
  );
}

function ReportPreview({ report }: { report: string }) {
  return (
    <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
      {report}
    </pre>
  );
}

function ToolLayout({
  form,
  result,
}: {
  form: React.ReactNode;
  result: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel>
        <div className="space-y-4">{form}</div>
      </Panel>
      <Panel>
        <div className="space-y-4">{result}</div>
      </Panel>
    </div>
  );
}

export function PublicComplianceTool({ slug }: { slug: PublicComplianceToolSlug }) {
  if (slug === "ai-inventory-generator") return <InventoryGenerator />;
  if (slug === "dpia-generator") return <DpiaGenerator />;
  if (slug === "ai-governance-maturity-assessment") return <MaturityAssessment />;
  if (slug === "compliance-documentation-generator") return <DocumentationGenerator />;
  return <AiActRiskClassifier />;
}

/**
 * Data Protection Impact Assessment (DPIA) Generator
 *
 * Generates a structured DPIA template from a program schema, following
 * GDPR Article 35 requirements and EDPB guidelines.  The output is a
 * structured JSON object that can later be converted to PDF/DOCX.
 */

import type { ProgramSchema, Node, ConnectionNode, AgentNode } from "@flowos/schema";
import type { RiskAssessment } from "./risk-classifier";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DpiaSection = {
  id: string;
  title: string;
  content: string;
  fields: DpiaField[];
};

export type DpiaField = {
  id: string;
  label: string;
  value: string;
  editable: boolean;
};

export type DpiaTemplate = {
  programId: string;
  programName: string;
  generatedAt: string;
  riskAssessment: RiskAssessment;
  sections: DpiaSection[];
  metadata: {
    version: string;
    framework: string;
    regulatoryBasis: string;
  };
};

// ─── Data category detection ────────────────────────────────────────────────

function detectDataCategories(schema: ProgramSchema): string[] {
  const categories = new Set<string>();
  const allText = JSON.stringify(schema.nodes).toLowerCase();

  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    "Personal identifiers": ["name", "email", "phone", "address", "id"],
    "Contact data": ["email", "phone", "sms", "whatsapp", "contact"],
    "Financial data": ["payment", "invoice", "billing", "credit", "bank", "stripe", "finance"],
    "Employment data": ["employee", "hr", "recruitment", "hiring", "payroll", "workday"],
    "Health data": ["health", "medical", "patient", "diagnosis", "clinical", "pharmacy"],
    "Biometric data": ["biometric", "facial", "fingerprint", "iris", "voice_recognition"],
    "Location data": ["location", "gps", "geolocation", "address", "geo"],
    "Communication data": ["message", "chat", "email", "slack", "teams", "communication"],
    "Usage/behaviour data": ["analytics", "tracking", "click", "behaviour", "usage"],
    "AI-generated content": ["llm", "openai", "anthropic", "generation", "completion"],
  };

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => allText.includes(kw))) {
      categories.add(category);
    }
  }

  return Array.from(categories);
}

function detectProcessingPurposes(schema: ProgramSchema): string[] {
  const purposes = new Set<string>();
  const allText = JSON.stringify(schema).toLowerCase();

  const PURPOSE_KEYWORDS: Record<string, string[]> = {
    "Data processing and transformation": ["transform", "convert", "parse", "format", "map"],
    "Communication and notifications": ["send", "notify", "email", "message", "sms", "slack"],
    "Data synchronisation": ["sync", "synchronize", "update", "push", "pull"],
    "Customer relationship management": ["crm", "customer", "lead", "deal", "pipeline"],
    "Content generation": ["generate", "write", "create", "draft", "compose"],
    "Data analysis": ["analyze", "report", "dashboard", "metrics", "insight"],
    "Workflow automation": ["trigger", "schedule", "cron", "automate", "workflow"],
    "AI-assisted decision making": ["agent", "llm", "ai", "model", "predict", "classify"],
  };

  for (const [purpose, keywords] of Object.entries(PURPOSE_KEYWORDS)) {
    if (keywords.some((kw) => allText.includes(kw))) {
      purposes.add(purpose);
    }
  }

  return Array.from(purposes);
}

function detectRecipients(schema: ProgramSchema): string[] {
  const recipients = new Set<string>();

  for (const node of schema.nodes) {
    if (node.type !== "connection") continue;
    const conn = node as ConnectionNode;
    const provider = conn.config?.provider ?? conn.connection ?? "Unknown integration";
    recipients.add(provider);
  }

  return Array.from(recipients);
}

function detectDataFlows(schema: ProgramSchema): Array<{
  from: string;
  to: string;
  dataTypes: string;
}> {
  const flows: Array<{ from: string; to: string; dataTypes: string }> = [];

  // Build a simple node label map
  const nodeLabels: Record<string, string> = {};
  for (const node of schema.nodes) {
    nodeLabels[node.id] = (node as any).label ?? node.id;
  }

  // Map edges to data flows
  for (const edge of schema.edges) {
    const source = nodeLabels[edge.source] ?? edge.source;
    const target = nodeLabels[edge.target] ?? edge.target;
    flows.push({
      from: source,
      to: target,
      dataTypes: "Program data",
    });
  }

  return flows;
}

// ─── Section generators ─────────────────────────────────────────────────────

function buildProcessingDescription(
  schema: ProgramSchema,
  dataCategories: string[],
  purposes: string[]
): DpiaSection {
  return {
    id: "processing_description",
    title: "1. Processing Description",
    content:
      "This section describes the nature, scope, context, and purposes of the data processing carried out by this program.",
    fields: [
      {
        id: "system_name",
        label: "System / Program Name",
        value: schema.program_name,
        editable: false,
      },
      {
        id: "system_description",
        label: "Description of Processing",
        value: schema.metadata.description || "No description provided.",
        editable: true,
      },
      {
        id: "data_controller",
        label: "Data Controller",
        value: "[Organisation name — to be completed]",
        editable: true,
      },
      {
        id: "dpo_contact",
        label: "Data Protection Officer Contact",
        value: "[DPO email — to be completed]",
        editable: true,
      },
      {
        id: "data_categories",
        label: "Categories of Data Subjects",
        value: dataCategories.length > 0 ? dataCategories.join(", ") : "To be determined",
        editable: true,
      },
      {
        id: "processing_purposes",
        label: "Purposes of Processing",
        value: purposes.length > 0 ? purposes.join("; ") : "To be determined",
        editable: true,
      },
      {
        id: "recipients",
        label: "Recipients / Third Parties",
        value:
          detectRecipients(schema).length > 0
            ? detectRecipients(schema).join(", ")
            : "To be determined",
        editable: true,
      },
      {
        id: "data_flow_summary",
        label: "Data Flow Summary",
        value: `${schema.nodes.length} nodes, ${schema.edges.length} edges — ${detectDataFlows(schema).length} data flows identified`,
        editable: false,
      },
    ],
  };
}

function buildNecessityProportionality(schema: ProgramSchema): DpiaSection {
  return {
    id: "necessity_proportionality",
    title: "2. Necessity and Proportionality",
    content:
      "Assess whether the processing is necessary and proportionate in relation to the purposes.",
    fields: [
      {
        id: "legal_basis",
        label: "Legal Basis for Processing (GDPR Art. 6)",
        value: "[Legitimate interest / Consent / Contract — to be completed]",
        editable: true,
      },
      {
        id: "necessity_justification",
        label: "Why is this processing necessary?",
        value: "[Describe why this workflow cannot be achieved with less data processing]",
        editable: true,
      },
      {
        id: "data_minimisation",
        label: "Data Minimisation Measures",
        value: `Program uses ${schema.nodes.length} processing nodes. Review each node for data minimisation compliance.`,
        editable: true,
      },
      {
        id: "storage_limitation",
        label: "Storage Limitation",
        value: "[Define retention period for processed data]",
        editable: true,
      },
      {
        id: "accuracy_measures",
        label: "Accuracy Measures",
        value: "[Describe how data accuracy is maintained]",
        editable: true,
      },
      {
        id: "safeguards",
        label: "Safeguards for Data Subjects",
        value: "Human oversight mode: " + schema.execution_mode,
        editable: true,
      },
    ],
  };
}

function buildRisksSection(
  schema: ProgramSchema,
  riskAssessment: RiskAssessment
): DpiaSection {
  const riskDescriptions = riskAssessment.factors.map((f) => f.description).join("\n");

  return {
    id: "risks",
    title: "3. Risks to Data Subjects",
    content:
      "Identified risks based on automated assessment of the program schema and connector configuration.",
    fields: [
      {
        id: "overall_risk_level",
        label: "Overall Risk Classification",
        value: riskAssessment.level.toUpperCase(),
        editable: false,
      },
      {
        id: "risk_score",
        label: "Risk Score",
        value: `${riskAssessment.score}/100`,
        editable: false,
      },
      {
        id: "identified_risks",
        label: "Identified Risk Factors",
        value: riskDescriptions || "No risk factors identified by automated assessment.",
        editable: true,
      },
      {
        id: "risk_to_rights",
        label: "Risk to Rights and Freedoms",
        value: "[Describe potential impact on data subjects' rights and freedoms]",
        editable: true,
      },
      {
        id: "likelihood",
        label: "Likelihood of Risk Materialising",
        value: "[High / Medium / Low — to be completed by DPO]",
        editable: true,
      },
      {
        id: "severity",
        label: "Severity of Impact",
        value: "[High / Medium / Low — to be completed by DPO]",
        editable: true,
      },
    ],
  };
}

function buildMitigationSection(
  schema: ProgramSchema,
  riskAssessment: RiskAssessment
): DpiaSection {
  const mitigationMeasures = riskAssessment.recommendations.map(
    (r) => `- [ ] ${r.title}: ${r.description}`
  );

  const executionModeNote =
    schema.execution_mode === "autonomous"
      ? "⚠️ Program runs in autonomous mode — consider switching to approval_required for high-risk decisions."
      : schema.execution_mode === "approval_required"
        ? "✅ Program requires human approval — aligns with EU AI Act oversight requirements."
        : "ℹ️ Program runs in supervised mode — human oversight is available.";

  return {
    id: "mitigation",
    title: "4. Measures to Address Risks",
    content: "Recommended mitigation measures based on the risk assessment.",
    fields: [
      {
        id: "mitigation_measures",
        label: "Recommended Measures",
        value:
          mitigationMeasures.length > 0
            ? mitigationMeasures.join("\n")
            : "No specific measures required for minimal-risk classification.",
        editable: true,
      },
      {
        id: "execution_mode_note",
        label: "Execution Mode Assessment",
        value: executionModeNote,
        editable: false,
      },
      {
        id: "human_oversight",
        label: "Human Oversight Measures",
        value: schema.execution_mode === "approval_required"
          ? "Human approval gates are configured."
          : "[Describe how human oversight is implemented]",
        editable: true,
      },
      {
        id: "technical_measures",
        label: "Technical Measures",
        value: "- Audit logging enabled\n- Execution trace captured\n- Error monitoring active",
        editable: true,
      },
      {
        id: "organisational_measures",
        label: "Organisational Measures",
        value: "[Describe staff training, access controls, and organisational policies]",
        editable: true,
      },
      {
        id: "review_schedule",
        label: "Review Schedule",
        value: "DPIA should be reviewed at least annually or when the program schema changes significantly.",
        editable: true,
      },
    ],
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateDpiaTemplate(
  schema: ProgramSchema,
  riskAssessment: RiskAssessment
): DpiaTemplate {
  const dataCategories = detectDataCategories(schema);
  const processingPurposes = detectProcessingPurposes(schema);

  return {
    programId: schema.program_id,
    programName: schema.program_name,
    generatedAt: new Date().toISOString(),
    riskAssessment,
    sections: [
      buildProcessingDescription(schema, dataCategories, processingPurposes),
      buildNecessityProportionality(schema),
      buildRisksSection(schema, riskAssessment),
      buildMitigationSection(schema, riskAssessment),
    ],
    metadata: {
      version: "1.0",
      framework: "EU GDPR / EU AI Act",
      regulatoryBasis:
        "GDPR Article 35 (Data Protection Impact Assessment), EU AI Act Article 9 (Risk Management System)",
    },
  };
}

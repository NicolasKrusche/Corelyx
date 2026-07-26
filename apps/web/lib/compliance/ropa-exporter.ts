/**
 * Records of Processing Activities (ROPA) Exporter
 *
 * Generates GDPR Article 30 Records of Processing Activities from a program
 * schema.  Extracts processing purposes, data categories, recipients,
 * retention periods, and security measures from the workflow definition.
 */

import type { ProgramSchema, ConnectionNode } from "@flowos/schema";
import { connectorProvider, connectorOperation } from "./connector-fields";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RopaRecord = {
  activityId: string;
  processingPurpose: string;
  categoriesOfDataSubjects: string[];
  categoriesOfPersonalData: string[];
  categoriesOfRecipients: Array<{
    name: string;
    category: string;
    country: string;
    safeguards: string;
  }>;
  transfersToThirdCountry: boolean;
  retentionPeriod: string;
  technicalAndOrganisationalMeasures: string[];
};

export type RopaExport = {
  programId: string;
  programName: string;
  generatedAt: string;
  controller: {
    name: string;
    contactPoint: string;
    dpoContact: string;
  };
  processor: {
    name: string;
    contactPoint: string;
  };
  processingActivities: RopaRecord[];
  metadata: {
    version: string;
    regulatoryBasis: string;
  };
};

// ─── Provider-to-category mapping ───────────────────────────────────────────

type RecipientInfo = {
  category: string;
  country: string;
  safeguards: string;
};

const PROVIDER_RECIPIENT_MAP: Record<string, RecipientInfo> = {
  // HR / Employment
  workday: { category: "HR platform", country: "US / EU", safeguards: "SCCs + supplementary measures" },
  bamboohr: { category: "HR platform", country: "US", safeguards: "SCCs" },
  greenhouse: { category: "Recruitment platform", country: "US", safeguards: "SCCs" },
  lever: { category: "Recruitment platform", country: "US", safeguards: "SCCs" },
  ashby: { category: "Recruitment platform", country: "US", safeguards: "SCCs" },
  // Finance
  stripe: { category: "Payment processor", country: "US / EU", safeguards: "SCCs + DPA" },
  plaid: { category: "Financial data aggregator", country: "US", safeguards: "SCCs" },
  // Communication
  slack: { category: "Communication platform", country: "US", safeguards: "SCCs + EU data residency" },
  microsoft_teams: { category: "Communication platform", country: "EU / US", safeguards: "SCCs + EU data residency" },
  discord: { category: "Communication platform", country: "US", safeguards: "SCCs" },
  // CRM
  salesforce: { category: "CRM platform", country: "US / EU", safeguards: "SCCs + DPA" },
  hubspot: { category: "CRM platform", country: "US", safeguards: "SCCs" },
  // Email
  gmail: { category: "Email service", country: "US", safeguards: "SCCs + EU data residency option" },
  outlook: { category: "Email service", country: "EU / US", safeguards: "SCCs" },
  mailchimp: { category: "Email marketing", country: "US", safeguards: "SCCs" },
  sendgrid: { category: "Email service", country: "US", safeguards: "SCCs" },
  // Social
  twitter: { category: "Social media platform", country: "US", safeguards: "SCCs" },
  linkedin: { category: "Professional network", country: "US", safeguards: "SCCs" },
  facebook: { category: "Social media platform", country: "US", safeguards: "SCCs" },
  instagram: { category: "Social media platform", country: "US", safeguards: "SCCs" },
  // Storage
  google_drive: { category: "Cloud storage", country: "EU / US", safeguards: "SCCs + EU data residency" },
  dropbox: { category: "Cloud storage", country: "US", safeguards: "SCCs" },
  onedrive: { category: "Cloud storage", country: "EU / US", safeguards: "SCCs + EU data residency" },
  s3: { category: "Cloud storage", country: "EU / US", safeguards: "SCCs + region config" },
  // AI
  openai: { category: "AI model provider", country: "US", safeguards: "SCCs + DPA + API data processing agreement" },
  anthropic: { category: "AI model provider", country: "US", safeguards: "SCCs + DPA" },
  google_ai: { category: "AI model provider", country: "US / EU", safeguards: "SCCs + Vertex AI DPA" },
  cohere: { category: "AI model provider", country: "US / CA", safeguards: "SCCs" },
  // Database
  postgresql: { category: "Database service", country: "Configurable", safeguards: "Region-specific" },
  mysql: { category: "Database service", country: "Configurable", safeguards: "Region-specific" },
  mongodb: { category: "Database service", country: "Configurable", safeguards: "Region-specific" },
  supabase: { category: "Backend-as-a-Service", country: "EU / US", safeguards: "DPA + EU hosting option" },
  // Analytics
  google_analytics: { category: "Analytics platform", country: "US", safeguards: "SCCs + IP anonymisation" },
  mixpanel: { category: "Analytics platform", country: "US", safeguards: "SCCs" },
  segment: { category: "Customer data platform", country: "US", safeguards: "SCCs + DPA" },
  // Identity
  auth0: { category: "Identity provider", country: "US / EU", safeguards: "SCCs + EU tenant option" },
  okta: { category: "Identity provider", country: "US", safeguards: "SCCs" },
};

// ─── Helper: detect data categories from connector ──────────────────────────

function detectDataCategoriesForConnector(provider: string): string[] {
  const categories: string[] = [];
  const p = provider.toLowerCase();

  if (["gmail", "outlook", "mailchimp", "sendgrid"].some((k) => p.includes(k))) {
    categories.push("Contact data", "Communication content");
  }
  if (["slack", "microsoft_teams", "discord"].some((k) => p.includes(k))) {
    categories.push("Communication content", "User identifiers");
  }
  if (["workday", "bamboohr", "greenhouse", "lever", "ashby"].some((k) => p.includes(k))) {
    categories.push("Employment data", "Personal identifiers", "CV / resume data");
  }
  if (["stripe", "plaid"].some((k) => p.includes(k))) {
    categories.push("Financial data", "Payment information");
  }
  if (["salesforce", "hubspot"].some((k) => p.includes(k))) {
    categories.push("Customer data", "Contact data", "Business communications");
  }
  if (["openai", "anthropic", "google_ai", "cohere"].some((k) => p.includes(k))) {
    categories.push("Prompts and inputs", "AI-generated outputs", "May contain personal data");
  }
  if (["google_drive", "dropbox", "onedrive", "s3"].some((k) => p.includes(k))) {
    categories.push("Document content", "File metadata");
  }
  if (["google_analytics", "mixpanel", "segment"].some((k) => p.includes(k))) {
    categories.push("Usage data", "Behavioural data", "Device identifiers");
  }
  if (["auth0", "okta"].some((k) => p.includes(k))) {
    categories.push("Authentication data", "User identifiers", "Session data");
  }

  if (categories.length === 0) {
    categories.push("General program data");
  }

  return categories;
}

// ─── Build ROPA records ─────────────────────────────────────────────────────

function buildRopaRecords(schema: ProgramSchema): RopaRecord[] {
  const records: RopaRecord[] = [];
  let activityIndex = 1;

  // Process each connection node as a distinct processing activity
  for (const node of schema.nodes) {
    if (node.type !== "connection") continue;
    const conn = node as ConnectionNode;
    const provider = connectorProvider(conn) || "unknown";
    const recipientInfo = PROVIDER_RECIPIENT_MAP[provider];

    const recipient = {
      name: provider.charAt(0).toUpperCase() + provider.slice(1),
      category: recipientInfo?.category ?? "Third-party service",
      country: recipientInfo?.country ?? "Unknown",
      safeguards: recipientInfo?.safeguards ?? "To be determined",
    };

    records.push({
      activityId: `PROC-${String(activityIndex).padStart(3, "0")}`,
      processingPurpose: determineProcessingPurpose(conn),
      categoriesOfDataSubjects: ["End users", "Data subjects as per connected service"],
      categoriesOfPersonalData: detectDataCategoriesForConnector(provider),
      categoriesOfRecipients: [recipient],
      transfersToThirdCountry: recipient.country.includes("US"),
      retentionPeriod: "As per workspace compliance settings (default: 90 days for execution logs)",
      technicalAndOrganisationalMeasures: [
        "Encryption in transit (TLS 1.2+)",
        "Access controls via workspace RBAC",
        "Audit logging of all data access",
        "Secret management via encrypted vault",
      ],
    });

    activityIndex++;
  }

  // If no connection nodes, create a generic processing activity
  if (records.length === 0) {
    records.push({
      activityId: "PROC-001",
      processingPurpose: "Internal data processing within Corelyx platform",
      categoriesOfDataSubjects: ["Platform users"],
      categoriesOfPersonalData: ["User account data", "Program configuration data"],
      categoriesOfRecipients: [
        {
          name: "Corelyx Platform",
          category: "SaaS platform",
          country: "EU",
          safeguards: "DPA + EU data residency",
        },
      ],
      transfersToThirdCountry: false,
      retentionPeriod: "As per workspace compliance settings",
      technicalAndOrganisationalMeasures: [
        "Encryption at rest and in transit",
        "Role-based access control",
        "Audit trail logging",
        "Regular security assessments",
      ],
    });
  }

  return records;
}

function determineProcessingPurpose(conn: ConnectionNode): string {
  const provider = connectorProvider(conn);
  // Was `config.action ?? config.operation`, but no ConnectionConfig variant has
  // an `action` field — that branch was always undefined.
  const action = connectorOperation(conn);

  // AI model providers
  if (["openai", "anthropic", "google_ai", "cohere"].some((k) => provider.includes(k))) {
    return `AI model inference: ${action || "text completion/analysis"}. Data sent to external AI provider for processing.`;
  }

  // Communication
  if (["slack", "microsoft_teams", "discord"].some((k) => provider.includes(k))) {
    return `Communication delivery: ${action || "message sending"}. Messages may contain personal data.`;
  }

  // Email
  if (["gmail", "outlook", "mailchimp", "sendgrid"].some((k) => provider.includes(k))) {
    return `Email processing: ${action || "send/receive"}. Email content and metadata processed.`;
  }

  // HR
  if (["workday", "bamboohr", "greenhouse", "lever", "ashby"].some((k) => provider.includes(k))) {
    return `HR data processing: ${action || "employee/recruitment management"}. Employment-related personal data processed.`;
  }

  // Finance
  if (["stripe", "plaid"].some((k) => provider.includes(k))) {
    return `Financial data processing: ${action || "payment/transaction"}. Financial personal data processed.`;
  }

  // CRM
  if (["salesforce", "hubspot"].some((k) => provider.includes(k))) {
    return `CRM data processing: ${action || "customer management"}. Customer relationship data processed.`;
  }

  // Storage
  if (["google_drive", "dropbox", "onedrive", "s3"].some((k) => provider.includes(k))) {
    return `File storage: ${action || "read/write"}. Document and file data stored/retrieved.`;
  }

  // Default
  return `Data processing via ${provider}: ${action || "general operation"}.`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateRopaExport(schema: ProgramSchema): RopaExport {
  return {
    programId: schema.program_id,
    programName: schema.program_name,
    generatedAt: new Date().toISOString(),
    controller: {
      name: "[Organisation name — to be completed]",
      contactPoint: "[Organisation address — to be completed]",
      dpoContact: "[DPO email — to be completed]",
    },
    processor: {
      name: "Corelyx GmbH",
      contactPoint: "Corelyx Platform — corelyx.com",
    },
    processingActivities: buildRopaRecords(schema),
    metadata: {
      version: "1.0",
      regulatoryBasis: "GDPR Article 30 — Records of Processing Activities",
    },
  };
}

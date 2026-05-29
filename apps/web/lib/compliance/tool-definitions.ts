export type PublicComplianceToolSlug =
  | "ai-act-risk-classifier"
  | "ai-inventory-generator"
  | "dpia-generator"
  | "ai-governance-maturity-assessment"
  | "compliance-documentation-generator";

export type PublicComplianceTool = {
  slug: PublicComplianceToolSlug;
  title: string;
  shortTitle: string;
  description: string;
  primaryQuery: string;
  audience: string;
};

export const PUBLIC_COMPLIANCE_TOOLS: PublicComplianceTool[] = [
  {
    slug: "ai-act-risk-classifier",
    title: "AI Act Risk Classifier",
    shortTitle: "Risk Classifier",
    description:
      "Classify an AI workflow against EU AI Act risk signals and generate a practical control checklist.",
    primaryQuery: "AI Act risk classifier",
    audience: "AI governance, legal, compliance, and automation teams.",
  },
  {
    slug: "ai-inventory-generator",
    title: "AI Inventory Generator",
    shortTitle: "Inventory Generator",
    description:
      "Create an AI system inventory record with owners, purpose, models, data sources, personal data, risk, and review status.",
    primaryQuery: "AI inventory generator",
    audience: "DPOs, AI governance owners, CTOs, and consultants building AI registers.",
  },
  {
    slug: "dpia-generator",
    title: "DPIA Generator",
    shortTitle: "DPIA Generator",
    description:
      "Generate a GDPR Data Protection Impact Assessment draft for AI workflows that process personal data.",
    primaryQuery: "DPIA generator for AI systems",
    audience: "Privacy teams, legal teams, consultants, and workflow owners.",
  },
  {
    slug: "ai-governance-maturity-assessment",
    title: "AI Governance Maturity Assessment",
    shortTitle: "Maturity Assessment",
    description:
      "Score an organization's AI governance readiness across inventory, classification, documentation, DPIA, audit, oversight, monitoring, and incident response.",
    primaryQuery: "AI governance maturity assessment",
    audience: "AI governance leaders, compliance officers, CTOs, and advisory teams.",
  },
  {
    slug: "compliance-documentation-generator",
    title: "Compliance Documentation Generator",
    shortTitle: "Documentation Generator",
    description:
      "Generate technical documentation for an AI workflow from inventory-style fields.",
    primaryQuery: "AI compliance documentation generator",
    audience: "AI workflow owners, product teams, auditors, and compliance teams.",
  },
];

export function getPublicComplianceTool(slug: string) {
  return PUBLIC_COMPLIANCE_TOOLS.find((tool) => tool.slug === slug);
}


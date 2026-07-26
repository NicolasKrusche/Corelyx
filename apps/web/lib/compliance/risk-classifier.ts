/**
 * EU AI Act Risk Classifier
 *
 * Analyses a program schema (nodes, edges, connectors) and classifies the
 * AI system under the EU AI Act risk tiers:
 *   - Unacceptable (prohibited)
 *   - High
 *   - Limited (transparency obligations)
 *   - Minimal
 *
 * Returns a structured assessment with a numeric score, contributing factors,
 * and actionable recommendations.
 */

import type { ProgramSchema, Node, ConnectionNode, AgentNode } from "@flowos/schema";
import { connectorProvider } from "./connector-fields";

// ─── Risk Levels ────────────────────────────────────────────────────────────

export type ComplianceRiskLevel = "minimal" | "limited" | "high" | "unacceptable";

export type RiskFactor = {
  id: string;
  label: string;
  description: string;
  /** Numeric weight that contributed to the overall score (positive = higher risk). */
  weight: number;
  /** Node or connector id that triggered this factor, if applicable. */
  sourceNodeId?: string;
};

export type RiskRecommendation = {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
};

export type RiskAssessment = {
  level: ComplianceRiskLevel;
  /** 0-100 score where higher = more risk. */
  score: number;
  factors: RiskFactor[];
  recommendations: RiskRecommendation[];
  assessedAt: string;
};

// ─── Connector category mapping ─────────────────────────────────────────────

/**
 * Known connector provider keywords → risk category tags used by the
 * classifier.  Extend this map as new connectors are added.
 */
const CONNECTOR_RISK_TAGS: Record<string, string[]> = {
  // HR / Employment
  workday: ["hr", "employment", "high_risk"],
  bamboohr: ["hr", "employment", "high_risk"],
  greenhouse: ["hr", "recruitment", "high_risk"],
  lever: ["hr", "recruitment", "high_risk"],
  ashby: ["hr", "recruitment", "high_risk"],
  // Finance
  stripe: ["finance", "payments"],
  plaid: ["finance", "creditworthiness", "high_risk"],
  // Communication
  slack: ["communication"],
  microsoft_teams: ["communication"],
  discord: ["communication"],
  // CRM / Sales
  salesforce: ["crm", "customer_data"],
  hubspot: ["crm", "customer_data"],
  // Email
  gmail: ["email", "communication"],
  outlook: ["email", "communication"],
  mailchimp: ["email", "marketing"],
  sendgrid: ["email", "communication"],
  // Social
  twitter: ["social", "public_data"],
  linkedin: ["social", "professional_data"],
  facebook: ["social", "public_data"],
  instagram: ["social", "public_data"],
  // Storage
  google_drive: ["storage", "document"],
  dropbox: ["storage", "document"],
  onedrive: ["storage", "document"],
  s3: ["storage", "infrastructure"],
  // LLM / AI
  openai: ["ai_model", "llm"],
  anthropic: ["ai_model", "llm"],
  google_ai: ["ai_model", "llm"],
  cohere: ["ai_model", "llm"],
  // Database
  postgresql: ["database"],
  mysql: ["database"],
  mongodb: ["database"],
  supabase: ["database"],
  // Analytics
  google_analytics: ["analytics"],
  mixpanel: ["analytics"],
  segment: ["analytics", "customer_data"],
  // Identity
  auth0: ["identity", "authentication"],
  okta: ["identity", "authentication"],
};

// ─── Node type heuristics ───────────────────────────────────────────────────

/** Keywords in node data that suggest higher-risk processing. */
const HIGH_RISK_NODE_KEYWORDS = [
  "hr",
  "recruitment",
  "hiring",
  "employee",
  "credit",
  "scoring",
  "creditworthiness",
  "insurance",
  "law_enforcement",
  "police",
  "biometric",
  "facial",
  "surveillance",
  "social_scoring",
  "manipulative",
  "deceptive",
  "medical",
  "healthcare",
  "diagnosis",
  "education",
  "grading",
  "assessment",
  "migration",
  "border",
  "justice",
  "election",
  "voting",
];

const LIMITED_RISK_KEYWORDS = [
  "chatbot",
  "chat",
  "emotion",
  "sentiment",
  "content_generation",
  "writing",
  "translation",
  "summarization",
  "image_generation",
  "deepfake",
  "voice",
  "speech",
];

// ─── Scoring constants ──────────────────────────────────────────────────────

const SCORE_UNACCEPTABLE_THRESHOLD = 80;
const SCORE_HIGH_THRESHOLD = 55;
const SCORE_LIMITED_THRESHOLD = 25;

const WEIGHT_CONNECTOR_HIGH_RISK = 25;
const WEIGHT_CONNECTOR_PERSONAL_DATA = 10;
const WEIGHT_CONNECTOR_AI_MODEL = 15;
const WEIGHT_NODE_HIGH_RISK_KEYWORD = 20;
const WEIGHT_NODE_LIMITED_KEYWORD = 8;
const WEIGHT_AGENT_AUTONOMOUS = 12;
const WEIGHT_DATA_OUTSIDE_EEA = 15;
const WEIGHT_NO_HUMAN_OVERSIGHT = 10;
const WEIGHT_SENSITIVE_CATEGORY_KEYWORD = 30;

// ─── Public API ─────────────────────────────────────────────────────────────

export function classifyRisk(schema: ProgramSchema): RiskAssessment {
  const factors: RiskFactor[] = [];
  let score = 0;

  // 1. Analyse connector nodes
  for (const node of schema.nodes) {
    if (node.type !== "connection") continue;
    const conn = node as ConnectionNode;
    const provider = connectorProvider(conn);

    // Check connector risk tags
    for (const [keyword, tags] of Object.entries(CONNECTOR_RISK_TAGS)) {
      if (!provider.includes(keyword)) continue;

      if (tags.includes("high_risk")) {
        const w = WEIGHT_CONNECTOR_HIGH_RISK;
        score += w;
        factors.push({
          id: `connector_hr_${conn.id}`,
          label: "High-risk connector",
          description: `Connector "${provider}" is associated with ${tags.filter((t) => t !== "high_risk").join(", ")} processing — classified as high-risk under EU AI Act.`,
          weight: w,
          sourceNodeId: conn.id,
        });
      }

      if (tags.includes("ai_model")) {
        const w = WEIGHT_CONNECTOR_AI_MODEL;
        score += w;
        factors.push({
          id: `connector_ai_${conn.id}`,
          label: "AI model connector",
          description: `Connector "${provider}" invokes an external AI model, triggering transparency and documentation obligations.`,
          weight: w,
          sourceNodeId: conn.id,
        });
      }

      if (tags.includes("customer_data") || tags.includes("professional_data")) {
        const w = WEIGHT_CONNECTOR_PERSONAL_DATA;
        score += w;
        factors.push({
          id: `connector_pd_${conn.id}`,
          label: "Personal data connector",
          description: `Connector "${provider}" likely processes personal data, requiring DPIA and data minimisation review.`,
          weight: w,
          sourceNodeId: conn.id,
        });
      }
    }
  }

  // 2. Analyse agent / LLM nodes
  for (const node of schema.nodes) {
    if (node.type === "agent") {
      const agent = node as AgentNode;
      const model = (agent.config?.model ?? "").toLowerCase();
      const agentText = JSON.stringify(agent.config ?? {}).toLowerCase();

      // Check for high-risk keywords in agent config
      for (const keyword of HIGH_RISK_NODE_KEYWORDS) {
        if (agentText.includes(keyword)) {
          const w = WEIGHT_NODE_HIGH_RISK_KEYWORD;
          score += w;
          factors.push({
            id: `agent_keyword_${keyword}_${agent.id}`,
            label: `High-risk keyword: ${keyword}`,
            description: `Agent node references "${keyword}" which may indicate a high-risk AI use case under EU AI Act.`,
            weight: w,
            sourceNodeId: agent.id,
          });
        }
      }

      // Check for limited-risk keywords
      for (const keyword of LIMITED_RISK_KEYWORDS) {
        if (agentText.includes(keyword)) {
          const w = WEIGHT_NODE_LIMITED_KEYWORD;
          score += w;
          factors.push({
            id: `agent_limited_${keyword}_${agent.id}`,
            label: `Limited-risk keyword: ${keyword}`,
            description: `Agent node references "${keyword}" — subject to transparency obligations under EU AI Act.`,
            weight: w,
            sourceNodeId: agent.id,
          });
        }
      }

      // Autonomous agents carry extra weight
      if (schema.execution_mode === "autonomous") {
        const w = WEIGHT_AGENT_AUTONOMOUS;
        score += w;
        factors.push({
          id: `agent_autonomous_${agent.id}`,
          label: "Autonomous agent execution",
          description: "Program runs in autonomous mode without human approval gates — increases AI Act risk profile.",
          weight: w,
          sourceNodeId: agent.id,
        });
      }
    }
  }

  // 3. Analyse node-level keywords across all node types
  for (const node of schema.nodes) {
    const nodeText = JSON.stringify(node).toLowerCase();

    for (const keyword of HIGH_RISK_NODE_KEYWORDS) {
      if (nodeText.includes(keyword) && !factors.some((f) => f.id.includes(keyword) && f.sourceNodeId === node.id)) {
        const w = WEIGHT_NODE_HIGH_RISK_KEYWORD;
        score += w;
        factors.push({
          id: `node_keyword_${keyword}_${node.id}`,
          label: `High-risk keyword: ${keyword}`,
          description: `Node "${(node as any).label ?? node.id}" references "${keyword}", suggesting a high-risk AI use case.`,
          weight: w,
          sourceNodeId: node.id,
        });
      }
    }

    for (const keyword of LIMITED_RISK_KEYWORDS) {
      if (nodeText.includes(keyword) && !factors.some((f) => f.id.includes(keyword) && f.sourceNodeId === node.id)) {
        const w = WEIGHT_NODE_LIMITED_KEYWORD;
        score += w;
        factors.push({
          id: `node_limited_${keyword}_${node.id}`,
          label: `Limited-risk keyword: ${keyword}`,
          description: `Node "${(node as any).label ?? node.id}" references "${keyword}", triggering transparency obligations.`,
          weight: w,
          sourceNodeId: node.id,
        });
      }
    }
  }

  // 4. Metadata-based signals
  // `human_oversight_required` is a typed optional field on ProgramMetadata, so
  // read it directly — the previous `as Record<string, unknown>` cast only
  // suppressed type checking on a field that is already known.
  if (schema.metadata.human_oversight_required === false) {
    const w = WEIGHT_NO_HUMAN_OVERSIGHT;
    score += w;
    factors.push({
      id: "no_human_oversight",
      label: "No human oversight configured",
      description: "The workspace does not require human oversight for this program, increasing AI Act risk.",
      weight: w,
    });
  }

  // Clamp score to 0-100
  score = Math.min(100, Math.max(0, score));

  // Determine risk level
  let level: ComplianceRiskLevel;
  if (score >= SCORE_UNACCEPTABLE_THRESHOLD) {
    level = "unacceptable";
  } else if (score >= SCORE_HIGH_THRESHOLD) {
    level = "high";
  } else if (score >= SCORE_LIMITED_THRESHOLD) {
    level = "limited";
  } else {
    level = "minimal";
  }

  // Generate recommendations
  const recommendations = buildRecommendations(level, factors);

  return {
    level,
    score,
    factors,
    recommendations,
    assessedAt: new Date().toISOString(),
  };
}

// ─── Recommendation builder ─────────────────────────────────────────────────

function buildRecommendations(
  level: ComplianceRiskLevel,
  factors: RiskFactor[]
): RiskRecommendation[] {
  const recs: RiskRecommendation[] = [];

  // Universal recommendations
  recs.push({
    id: "dpia_review",
    title: "Review DPIA status",
    description: "Ensure a Data Protection Impact Assessment is completed or updated for this program.",
    priority: level === "minimal" ? "low" : "high",
  });

  if (level === "unacceptable" || level === "high") {
    recs.push({
      id: "legal_review",
      title: "Mandatory legal review",
      description:
        level === "unacceptable"
          ? "This program may use a prohibited AI practice. Escalate to legal counsel immediately."
          : "High-risk classification requires conformity assessment, human oversight, and detailed technical documentation.",
      priority: "critical",
    });
  }

  if (factors.some((f) => f.id.startsWith("connector_ai_"))) {
    recs.push({
      id: "ai_transparency",
      title: "AI transparency notice",
      description: "Display an AI transparency notice to end users as required by EU AI Act Article 50.",
      priority: "high",
    });
  }

  if (factors.some((f) => f.id.startsWith("agent_autonomous_"))) {
    recs.push({
      id: "human_oversight_gate",
      title: "Add human oversight gate",
      description: "Consider switching to 'approval_required' or 'supervised' execution mode for high-risk decisions.",
      priority: level === "high" || level === "unacceptable" ? "high" : "medium",
    });
  }

  if (factors.some((f) => f.id.startsWith("connector_pd_"))) {
    recs.push({
      id: "data_minimisation",
      title: "Data minimisation review",
      description: "Review personal data flow through connectors — apply data minimisation and purpose limitation.",
      priority: "medium",
    });
  }

  if (level === "limited") {
    recs.push({
      id: "transparency_obligations",
      title: "Transparency obligations apply",
      description:
        "Limited-risk AI systems must clearly inform users they are interacting with an AI system.",
      priority: "high",
    });
  }

  if (level === "minimal") {
    recs.push({
      id: "voluntary_code",
      title: "Consider voluntary compliance",
      description:
        "While minimal-risk AI systems have no mandatory obligations, adopting voluntary codes of conduct is recommended.",
      priority: "low",
    });
  }

  // Audit trail recommendation for any non-minimal
  if (level !== "minimal") {
    recs.push({
      id: "audit_trail",
      title: "Enable audit trail",
      description: "Ensure execution logs capture model inputs, outputs, and decision rationale for regulatory audits.",
      priority: "medium",
    });
  }

  return recs;
}

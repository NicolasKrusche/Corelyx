// Onboarding option catalogs, shared between the signup wizard (client) and the
// /api/onboarding route (server-side validation).
//
// Everything here is CATEGORICAL by design: each option is a fixed key the user
// picks, never free text. That makes the picked values safe to store and pass
// to AI features without consent (anonymized metadata) — the GDPR-sensitive
// free-text answers live separately and are consent-gated.

export const ACCOUNT_TYPES = [
  {
    id: "personal",
    label: "Personal",
    description: "Automating my own projects and day-to-day tasks",
  },
  {
    id: "startup",
    label: "Startup",
    description: "A small team moving fast and wearing many hats",
  },
  {
    id: "business",
    label: "Business",
    description: "An established company with defined teams and processes",
  },
  {
    id: "agency",
    label: "Agency",
    description: "Building and running automations for clients",
  },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["id"];

export const TEAM_SIZES = [
  { id: "solo", label: "Just me" },
  { id: "2_10", label: "2–10 people" },
  { id: "11_50", label: "11–50 people" },
  { id: "51_200", label: "51–200 people" },
  { id: "200_plus", label: "200+ people" },
] as const;

export type TeamSize = (typeof TEAM_SIZES)[number]["id"];

export const INDUSTRIES = [
  { id: "software", label: "Software & IT" },
  { id: "ecommerce", label: "E-commerce & Retail" },
  { id: "marketing", label: "Marketing & Media" },
  { id: "finance", label: "Finance & Insurance" },
  { id: "healthcare", label: "Healthcare" },
  { id: "education", label: "Education" },
  { id: "manufacturing", label: "Manufacturing & Logistics" },
  { id: "professional_services", label: "Professional Services" },
  { id: "real_estate", label: "Real Estate" },
  { id: "nonprofit", label: "Non-profit" },
  { id: "other", label: "Other" },
] as const;

export type Industry = (typeof INDUSTRIES)[number]["id"];

export const ROLES = [
  { id: "founder", label: "Founder / C-level" },
  { id: "ops", label: "Operations" },
  { id: "engineering", label: "Engineering / IT" },
  { id: "marketing", label: "Marketing / Growth" },
  { id: "sales", label: "Sales / Customer Success" },
  { id: "product", label: "Product / Design" },
  { id: "hr_finance", label: "HR / Finance" },
  { id: "other", label: "Other" },
] as const;

export type Role = (typeof ROLES)[number]["id"];

// Goals for personal accounts ("what do you want to get out of this?").
export const PERSONAL_GOALS = [
  { id: "save_time", label: "Save time on repetitive tasks" },
  { id: "side_project", label: "Power a side project" },
  { id: "learn_automation", label: "Learn AI automation" },
  { id: "organize_life", label: "Organize my digital life" },
  { id: "content", label: "Create and publish content" },
  { id: "freelance", label: "Support my freelance work" },
] as const;

// Goals for team accounts (startup / business / agency).
export const TEAM_GOALS = [
  { id: "internal_ops", label: "Streamline internal operations" },
  { id: "customer_comms", label: "Automate customer communication" },
  { id: "lead_handling", label: "Capture and route leads" },
  { id: "reporting", label: "Automated reporting & dashboards" },
  { id: "data_sync", label: "Keep tools and data in sync" },
  { id: "client_delivery", label: "Deliver automations to clients" },
] as const;

export type GoalId =
  | (typeof PERSONAL_GOALS)[number]["id"]
  | (typeof TEAM_GOALS)[number]["id"];

// Tool slugs align with runtime connector providers so suggestions and the AI
// context can reference real integrations.
export const TOOL_OPTIONS = [
  { id: "gmail", label: "Gmail" },
  { id: "outlook", label: "Outlook" },
  { id: "slack", label: "Slack" },
  { id: "teams", label: "Microsoft Teams" },
  { id: "notion", label: "Notion" },
  { id: "sheets", label: "Google Sheets" },
  { id: "airtable", label: "Airtable" },
  { id: "hubspot", label: "HubSpot" },
  { id: "salesforce", label: "Salesforce" },
  { id: "pipedrive", label: "Pipedrive" },
  { id: "stripe", label: "Stripe" },
  { id: "shopify", label: "Shopify" },
  { id: "github", label: "GitHub" },
  { id: "jira", label: "Jira" },
  { id: "linear", label: "Linear" },
  { id: "asana", label: "Asana" },
  { id: "trello", label: "Trello" },
  { id: "mailchimp", label: "Mailchimp" },
  { id: "typeform", label: "Typeform" },
  { id: "calendly", label: "Calendly" },
  { id: "zendesk", label: "Zendesk" },
  { id: "intercom", label: "Intercom" },
] as const;

export type ToolId = (typeof TOOL_OPTIONS)[number]["id"];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const byId = <T extends readonly { id: string; label: string }[]>(list: T) =>
  new Map(list.map((o) => [o.id, o.label] as const));

export const ACCOUNT_TYPE_LABELS = byId(ACCOUNT_TYPES);
export const TEAM_SIZE_LABELS = byId(TEAM_SIZES);
export const INDUSTRY_LABELS = byId(INDUSTRIES);
export const ROLE_LABELS = byId(ROLES);
export const GOAL_LABELS = byId([...PERSONAL_GOALS, ...TEAM_GOALS]);
export const TOOL_LABELS = byId(TOOL_OPTIONS);

export const ACCOUNT_TYPE_IDS = ACCOUNT_TYPES.map((o) => o.id);
export const TEAM_SIZE_IDS = TEAM_SIZES.map((o) => o.id);
export const INDUSTRY_IDS = INDUSTRIES.map((o) => o.id);
export const ROLE_IDS = ROLES.map((o) => o.id);
export const GOAL_IDS = [...PERSONAL_GOALS, ...TEAM_GOALS].map((o) => o.id);
export const TOOL_IDS = TOOL_OPTIONS.map((o) => o.id);

/** Goals catalog appropriate for the chosen account type. */
export function goalsForAccountType(accountType: AccountType | null) {
  return accountType === "personal" ? PERSONAL_GOALS : TEAM_GOALS;
}

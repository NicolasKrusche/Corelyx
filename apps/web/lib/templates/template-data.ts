/**
 * Curated template data for the Template Gallery.
 *
 * These are static, seed templates displayed in the UI alongside
 * any user-created templates stored in the Supabase `templates` table.
 */

export type Difficulty = "easy" | "medium" | "hard";

export interface TemplateData {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
}

export const DIFFICULTY_EMOJI: Record<Difficulty, string> = {
  easy: "🟢",
  medium: "🟡",
  hard: "🔴",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const TEMPLATE_CATEGORIES = [
  "all",
  "general",
  "devops",
  "ecommerce",
  "marketing",
  "sales",
  "productivity",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  general: "General",
  devops: "DevOps",
  ecommerce: "E-Commerce",
  marketing: "Marketing",
  sales: "Sales",
  productivity: "Productivity",
};

export const CURATED_TEMPLATES: TemplateData[] = [
  {
    id: "email-slack-summary",
    name: "Email → Slack Summary",
    description:
      "Automatically summarize incoming emails with AI and post the key points to a Slack channel.",
    category: "general",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["Gmail", "Slack"],
    tags: ["email", "slack", "ai", "summary"],
  },
  {
    id: "github-issue-notion",
    name: "GitHub Issue → Notion Page",
    description:
      "When a new GitHub issue is created, automatically create a corresponding Notion page for tracking.",
    category: "devops",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["GitHub", "Notion"],
    tags: ["github", "notion", "issues", "tracking"],
  },
  {
    id: "form-submission-crm-lead",
    name: "Form Submission → CRM Lead",
    description:
      "Capture web form submissions and automatically create a new lead entry in your CRM system.",
    category: "sales",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["HTTP", "CRM"],
    tags: ["form", "crm", "lead", "sales"],
  },
  {
    id: "daily-digest",
    name: "Daily Digest",
    description:
      "Compile a daily summary of your most important activities across email, calendar, and tasks.",
    category: "general",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["Gmail", "Slack"],
    tags: ["daily", "digest", "summary", "automation"],
  },
  {
    id: "weekly-report",
    name: "Weekly Report",
    description:
      "Automatically compile a weekly performance report from multiple data sources and send it via email.",
    category: "marketing",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["Gmail", "Sheets"],
    tags: ["report", "weekly", "analytics", "email"],
  },
  {
    id: "github-pr-review",
    name: "GitHub PR Review",
    description:
      "Automatically review pull requests with AI, check for common issues, and post feedback as comments.",
    category: "devops",
    difficulty: "medium",
    estimated_runtime: "~ 3 Min",
    required_connections: ["GitHub"],
    tags: ["github", "pr", "review", "ai"],
  },
  {
    id: "meeting-notes-task",
    name: "Meeting Notes → Tasks",
    description:
      "Extract action items from meeting notes and automatically create tasks in your project management tool.",
    category: "sales",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["Notion", "Slack"],
    tags: ["meeting", "tasks", "notes", "productivity"],
  },
  {
    id: "invoice-processing",
    name: "Invoice Processing",
    description:
      "Parse incoming invoice emails, extract key data, validate amounts, and log them in your finance system.",
    category: "ecommerce",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["Gmail", "HTTP"],
    tags: ["invoice", "finance", "automation", "parsing"],
  },
  {
    id: "social-media-monitor",
    name: "Social Media Monitor",
    description:
      "Track brand mentions and engagement across social media platforms, alerting you to important activity.",
    category: "marketing",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["HTTP", "Slack"],
    tags: ["social", "monitoring", "marketing", "alerts"],
  },
  {
    id: "api-health-check",
    name: "API Health Check",
    description:
      "Periodically check API endpoint health, measure response times, and notify on failures or degradation.",
    category: "devops",
    difficulty: "hard",
    estimated_runtime: "~ 5 Min",
    required_connections: ["HTTP", "Slack"],
    tags: ["api", "health", "monitoring", "devops"],
  },
  // ─── Marketplace Featured Templates ──────────────────────────────────────
  {
    id: "gmail-slack-notification",
    name: "Gmail → Slack Notification",
    description:
      "Forward important emails to a Slack channel automatically. AI filters and summarizes each message before posting.",
    category: "general",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["Gmail", "Slack"],
    tags: ["email", "slack", "notification", "ai"],
  },
  {
    id: "notion-sheets-sync",
    name: "Notion → Google Sheets Sync",
    description:
      "Keep your Google Sheets in sync with Notion database entries. Automatically sync new and updated records.",
    category: "general",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["Notion", "Sheets"],
    tags: ["notion", "sheets", "sync", "data"],
  },
  {
    id: "github-linear-issue",
    name: "GitHub → Linear Issue Creation",
    description:
      "Automatically create Linear issues from new GitHub issues. Keeps your project tracking in sync with your code repository.",
    category: "devops",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["GitHub", "Linear"],
    tags: ["github", "linear", "issues", "devops"],
  },
  {
    id: "typeform-email-confirmation",
    name: "Typeform → Email Confirmation",
    description:
      "Send a personalized confirmation email when someone submits a Typeform. Perfect for registration forms and lead capture.",
    category: "marketing",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["Typeform", "Gmail"],
    tags: ["typeform", "email", "confirmation", "marketing"],
  },
  {
    id: "stripe-invoice-generation",
    name: "Stripe → Invoice Generation",
    description:
      "Automatically generate and send invoices when Stripe payments complete. Includes AI-powered invoice formatting.",
    category: "ecommerce",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["Stripe", "Gmail"],
    tags: ["stripe", "invoice", "payment", "billing"],
  },
  {
    id: "shopify-inventory-sync",
    name: "Shopify → Inventory Sync",
    description:
      "Monitor Shopify inventory levels and sync low-stock alerts to Google Sheets. Track inventory changes over time.",
    category: "ecommerce",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["HTTP", "Sheets"],
    tags: ["shopify", "inventory", "sync", "ecommerce"],
  },
  {
    id: "hubspot-crm-update",
    name: "HubSpot → CRM Update",
    description:
      "Keep your CRM updated automatically when HubSpot contacts change. Sync contact details and deal stages.",
    category: "sales",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["HubSpot"],
    tags: ["hubspot", "crm", "contacts", "sales"],
  },
  {
    id: "webhook-database-write",
    name: "Webhook → Database Write",
    description:
      "Receive webhook data and write it directly to your database. Perfect for integrating external services with your data layer.",
    category: "general",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["HTTP", "Supabase"],
    tags: ["webhook", "database", "integration", "api"],
  },
  {
    id: "rss-social-media-post",
    name: "RSS → Social Media Post",
    description:
      "Automatically share new RSS feed items on your social media channels. AI rewrites content for each platform.",
    category: "marketing",
    difficulty: "medium",
    estimated_runtime: "~ 2 Min",
    required_connections: ["HTTP", "Slack"],
    tags: ["rss", "social", "content", "marketing"],
  },
  {
    id: "calendar-meeting-prep",
    name: "Calendar → Meeting Prep Email",
    description:
      "Get an AI-generated meeting prep email before each meeting. Includes attendee info, agenda items, and relevant context.",
    category: "sales",
    difficulty: "easy",
    estimated_runtime: "< 1 Min",
    required_connections: ["Calendar", "Gmail"],
    tags: ["calendar", "meeting", "prep", "productivity"],
  },
];

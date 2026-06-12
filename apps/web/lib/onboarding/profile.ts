// Onboarding profile → AI context + personalized suggestions.
//
// GDPR boundary lives here: buildAiContext (free text included) may only be
// called for consented profiles; buildAnonymizedContext is the no-consent
// fallback and must only ever touch categorical catalog keys. getUserAiContext
// is the single read path AI features (Genesis, agent dispatch) go through, so
// the consent gate cannot be bypassed by a call site forgetting to check.

import {
  ACCOUNT_TYPE_LABELS,
  GOAL_LABELS,
  INDUSTRY_LABELS,
  ROLE_LABELS,
  TEAM_SIZE_LABELS,
  TOOL_LABELS,
  type AccountType,
} from "./options";

export type OnboardingAnswers = {
  account_type: AccountType | null;
  team_size: string | null;
  industry: string | null;
  role: string | null;
  goals: string[];
  tools: string[];
  current_processes: string | null;
  automation_wishes: string | null;
  profile_consent: boolean;
};

export type OnboardingProfileRow = OnboardingAnswers & { ai_context: string | null };

const label = (map: Map<string, string>, id: string | null) =>
  id ? map.get(id) ?? null : null;

/**
 * Anonymized context line built ONLY from categorical catalog keys. Safe to
 * pass to AI features without profile consent — carries no free text and no
 * directly identifying data.
 */
export function buildAnonymizedContext(answers: OnboardingAnswers): string | null {
  const parts: string[] = [];
  const accountType = label(ACCOUNT_TYPE_LABELS, answers.account_type);
  if (accountType) parts.push(`Account type: ${accountType}`);
  const industry = label(INDUSTRY_LABELS, answers.industry);
  if (industry) parts.push(`Industry: ${industry}`);
  const teamSize = label(TEAM_SIZE_LABELS, answers.team_size);
  if (teamSize) parts.push(`Team size: ${teamSize}`);
  const role = label(ROLE_LABELS, answers.role);
  if (role) parts.push(`Role: ${role}`);
  const goals = answers.goals.map((g) => label(GOAL_LABELS, g)).filter(Boolean);
  if (goals.length > 0) parts.push(`Goals: ${goals.join(", ")}`);
  const tools = answers.tools.map((t) => label(TOOL_LABELS, t)).filter(Boolean);
  if (tools.length > 0) parts.push(`Tools in use: ${tools.join(", ")}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Full background summary for AI features — includes the user's free-text
 * answers, so it may only be built/stored when profile_consent is true.
 * Callers pass free text already PII-sanitized (see the /api/onboarding route).
 */
export function buildAiContext(answers: OnboardingAnswers): string | null {
  if (!answers.profile_consent) return null;
  const parts: string[] = [];
  const categorical = buildAnonymizedContext(answers);
  if (categorical) parts.push(categorical);
  const processes = answers.current_processes?.trim();
  if (processes) parts.push(`Current processes (user's own words): ${processes}`);
  const wishes = answers.automation_wishes?.trim();
  if (wishes) parts.push(`Wants to automate (user's own words): ${wishes}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Single read path for AI features. Returns the consented ai_context when
 * present, otherwise the anonymized categorical summary, otherwise null.
 * `service` is a service-role client — server-only code paths.
 */
export async function getUserAiContext(
  service: { from(table: string): any },
  userId: string
): Promise<string | null> {
  const { data } = await service
    .from("onboarding_profiles")
    .select("account_type, team_size, industry, role, goals, tools, profile_consent, ai_context")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as
    | (Omit<OnboardingProfileRow, "current_processes" | "automation_wishes"> & {
        goals: string[] | null;
        tools: string[] | null;
      })
    | null;
  if (!row) return null;
  if (row.profile_consent && row.ai_context) return row.ai_context;
  return buildAnonymizedContext({
    account_type: row.account_type,
    team_size: row.team_size,
    industry: row.industry,
    role: row.role,
    goals: row.goals ?? [],
    tools: row.tools ?? [],
    current_processes: null,
    automation_wishes: null,
    profile_consent: false,
  });
}

// ── Personalized suggestions ──────────────────────────────────────────────────
// Deterministic, rule-based: cheap, testable, and available instantly at the
// end of onboarding without an LLM call. Each suggestion's `prompt` is a ready
// Genesis description the user can build from.

export type WorkflowSuggestion = {
  title: string;
  description: string;
  prompt: string;
};

type Rule = {
  /** Matches when the user selected ALL of these tools. */
  tools?: string[];
  /** Matches when the user selected ANY of these goals. */
  goals?: string[];
  /** Matches when the account type is one of these. */
  accountTypes?: AccountType[];
  suggestion: WorkflowSuggestion;
};

const RULES: Rule[] = [
  {
    tools: ["gmail", "notion"],
    suggestion: {
      title: "Email → Notion knowledge base",
      description: "Capture important emails into a structured Notion database automatically.",
      prompt: "When I label an email in Gmail, summarize it with AI and add it as a page to a Notion database.",
    },
  },
  {
    tools: ["gmail", "slack"],
    suggestion: {
      title: "Important-email alerts in Slack",
      description: "Get a Slack ping with an AI summary whenever a high-priority email arrives.",
      prompt: "Watch my Gmail inbox, classify incoming mail by urgency with AI, and post urgent ones to a Slack channel with a short summary.",
    },
  },
  {
    tools: ["stripe", "slack"],
    suggestion: {
      title: "Revenue events in Slack",
      description: "Celebrate new payments and catch failed charges as they happen.",
      prompt: "When a Stripe payment succeeds or fails, post a formatted message to Slack with amount, customer, and status.",
    },
  },
  {
    tools: ["shopify", "sheets"],
    suggestion: {
      title: "Daily Shopify sales report",
      description: "A spreadsheet that fills itself with yesterday's orders every morning.",
      prompt: "Every morning, fetch yesterday's Shopify orders and append them to a Google Sheet, then compute daily totals.",
    },
  },
  {
    tools: ["hubspot", "slack"],
    suggestion: {
      title: "New-lead routing",
      description: "Qualify new HubSpot leads with AI and notify the right people instantly.",
      prompt: "When a new contact is created in HubSpot, score it with AI based on its properties and notify the sales channel in Slack with the score and next step.",
    },
  },
  {
    tools: ["typeform", "sheets"],
    suggestion: {
      title: "Form responses → spreadsheet + summary",
      description: "Collect Typeform answers in a sheet with an AI digest of trends.",
      prompt: "When a Typeform response arrives, append it to a Google Sheet and once a week send me an AI summary of all new responses.",
    },
  },
  {
    tools: ["github", "slack"],
    suggestion: {
      title: "Release notes drafter",
      description: "Turn merged pull requests into human-readable release notes.",
      prompt: "Every Friday, collect this week's merged GitHub pull requests, draft release notes with AI, and post them to Slack for review.",
    },
  },
  {
    tools: ["calendly", "gmail"],
    suggestion: {
      title: "Meeting prep briefings",
      description: "An automatic research briefing before every booked call.",
      prompt: "When a Calendly meeting is booked, research the attendee's company with AI and email me a one-page briefing an hour before the call.",
    },
  },
  {
    tools: ["zendesk"],
    suggestion: {
      title: "Support ticket triage",
      description: "Classify and prioritize incoming tickets before a human reads them.",
      prompt: "When a new Zendesk ticket arrives, classify topic and urgency with AI, set the priority field, and tag it accordingly.",
    },
  },
  {
    tools: ["intercom"],
    suggestion: {
      title: "Conversation digest",
      description: "A daily AI digest of customer conversations and emerging issues.",
      prompt: "Every evening, summarize today's Intercom conversations with AI and send me a digest of common questions and emerging issues.",
    },
  },
  {
    goals: ["reporting"],
    suggestion: {
      title: "Weekly metrics report",
      description: "One workflow that gathers your numbers and writes the report for you.",
      prompt: "Every Monday morning, gather key metrics from my connected tools, have AI write a short status report, and deliver it to me.",
    },
  },
  {
    goals: ["lead_handling"],
    suggestion: {
      title: "Lead capture & follow-up",
      description: "Never let a lead go cold: capture, enrich, and schedule the follow-up.",
      prompt: "When a new lead comes in, enrich it with AI research, add it to my CRM, and draft a personalized follow-up email for my review.",
    },
  },
  {
    goals: ["customer_comms"],
    suggestion: {
      title: "Customer reply drafts",
      description: "AI-drafted responses in your tone, waiting for your approval.",
      prompt: "When a customer message arrives, draft a reply with AI in my brand voice and hold it for my approval before sending.",
    },
  },
  {
    goals: ["data_sync"],
    suggestion: {
      title: "Two-tool data sync",
      description: "Keep records consistent across the tools your team actually uses.",
      prompt: "When a record changes in one of my tools, update the matching record in my other tool so both stay in sync.",
    },
  },
  {
    goals: ["content"],
    suggestion: {
      title: "Content repurposing pipeline",
      description: "Write once, publish everywhere — drafts generated for each channel.",
      prompt: "When I publish a new piece of content, have AI repurpose it into a social post, a newsletter blurb, and a short summary, and save the drafts for review.",
    },
  },
  {
    goals: ["organize_life", "save_time"],
    suggestion: {
      title: "Personal daily briefing",
      description: "One morning message with everything you need to know today.",
      prompt: "Every morning at 8am, collect my unread important emails and today's calendar events, and send me a single AI-written briefing.",
    },
  },
  {
    accountTypes: ["agency"],
    suggestion: {
      title: "Client status reporter",
      description: "Automated weekly status updates your clients will actually read.",
      prompt: "Every Friday, collect this week's activity for a client project and have AI write a friendly status update email, held for my approval.",
    },
  },
  {
    accountTypes: ["startup"],
    suggestion: {
      title: "Investor / team update drafter",
      description: "Monthly updates assembled from your real numbers, not memory.",
      prompt: "At the end of each month, gather key metrics and shipped work, and have AI draft our monthly team and investor update for review.",
    },
  },
];

const FALLBACK_SUGGESTIONS: WorkflowSuggestion[] = [
  {
    title: "Start with a daily AI briefing",
    description: "A simple first workflow: one scheduled message that summarizes what matters.",
    prompt: "Every morning, send me a short AI-written briefing of anything new in my connected tools.",
  },
  {
    title: "Automate one repetitive task",
    description: "Describe any task you do more than twice a week — Genesis builds the workflow.",
    prompt: "Help me automate a repetitive task: ",
  },
];

/**
 * Rule-based suggestions from the categorical answers. Deterministic: same
 * answers → same suggestions, ordered by rule priority. Always returns at
 * least two suggestions (falls back to generic starters).
 */
export function buildSuggestions(answers: OnboardingAnswers, max = 4): WorkflowSuggestion[] {
  const tools = new Set(answers.tools);
  const goals = new Set(answers.goals);
  const picked: WorkflowSuggestion[] = [];

  for (const rule of RULES) {
    if (picked.length >= max) break;
    if (rule.tools && !rule.tools.every((t) => tools.has(t))) continue;
    if (rule.goals && !rule.goals.some((g) => goals.has(g))) continue;
    if (rule.accountTypes && (!answers.account_type || !rule.accountTypes.includes(answers.account_type))) continue;
    picked.push(rule.suggestion);
  }

  for (const fallback of FALLBACK_SUGGESTIONS) {
    if (picked.length >= 2) break;
    picked.push(fallback);
  }

  return picked.slice(0, max);
}

// Relay.app → Corelyx mapping table.
//
// Relay's wind-down export gives each workflow a build prompt AND a
// structural JSON, but nobody documents the JSON's app/action identifiers and
// Relay's own note says the JSON "won't work through native importers" without
// AI interpretation. So this table is NOT a deterministic parser — it is the
// seed of one, and its primary jobs today are:
//   1. Powering the pre-import preview (which of a workflow's apps we cover).
//   2. Grounding the conversion prompt (buildRelayConversionAddendum) so the
//      model maps Relay steps onto real Corelyx providers/operations.
//
// It is deliberately dependency-free and client-safe: the wizard resolves
// coverage in the browser (the run data in a Relay zip never has to upload).
//
// When we obtain real export samples, extend EXPLICIT_APP_ALIASES / the concept
// map here rather than scattering knowledge across the converter.

/** The connector slugs implemented under apps/runtime/connectors (203). */
export const CORELYX_PROVIDER_SLUGS: ReadonlySet<string> = new Set([
  "activecampaign", "acuityscheduling", "adyen", "ahrefs", "aircall", "airtable",
  "amplitude", "apollo", "asana", "auth0", "awss3", "bamboohr", "basecamp",
  "beehiiv", "bitbucket", "box", "braintree", "braze", "brevo", "brex", "buffer",
  "calendar", "calendly", "campaignmonitor", "canva", "chargebee", "circleci",
  "clearbit", "clickup", "clockify", "closecrm", "cloudflare", "cloudinary",
  "coda", "cohere", "confluence", "constantcontact", "contentful", "convertkit",
  "copper", "crisp", "customerio", "datadog", "deel", "dialpad", "digitalocean",
  "discord", "docs", "docusign", "doodle", "drift", "drip", "drive", "dropbox",
  "eventbrite", "evernote", "expensify", "facebook", "figma", "firebase",
  "framer", "freshbooks", "freshdesk", "freshsales", "freshservice", "front",
  "fullstory", "ghost", "github", "gitlab", "gmail", "gocardless",
  "googleanalytics", "googlechat", "googleforms", "gorgias", "grafana",
  "greenhouse", "gusto", "harvest", "heap", "height", "hellosign", "helpscout",
  "heroku", "hibob", "hootsuite", "hotjar", "hubspot", "hubstaff", "hunter",
  "insightly", "instagram", "intercom", "invision", "iterable", "jira",
  "jotform", "jumpcloud", "keap", "klaviyo", "kustomer", "lattice",
  "lemonsqueezy", "lever", "linear", "linkedin", "loom", "luma", "lusha",
  "mailchimp", "miro", "mixpanel", "mollie", "monday", "mux", "netlify",
  "netsuite", "newrelic", "nifty", "notion", "nuclino", "nutshell", "okta",
  "onedrive", "onenote", "openai", "openphone", "opsgenie", "outlook", "paddle",
  "pagerduty", "pandadoc", "paperform", "paypal", "personio", "pinecone",
  "pinterest", "pipedrive", "plausible", "posthog", "postmark", "prismic",
  "quickbooks", "ramp", "recurly", "reddit", "render", "replicate", "resend",
  "ringcentral", "rippling", "rocketchat", "rudderstack", "salesforce", "sanity",
  "segment", "semrush", "sendgrid", "sentry", "servicenow", "sheets", "shopify",
  "simplybook", "slack", "smartsheet", "square", "storyblok", "stripe",
  "supabase", "surveymonkey", "tally", "teams", "teamwork", "telegram", "telnyx",
  "thunderbird", "tiktok", "todoist", "toggl", "trello", "twilio", "twitter",
  "typeform", "vercel", "vimeo", "vonage", "webex", "webflow", "whatsapp",
  "wistia", "wordpress", "workable", "workday", "wrike", "xero", "youtube",
  "zendesk", "zeplin", "zohocrm", "zohoprojects", "zoom", "zoominfo",
]);

export type RelayAppResolution =
  // A first-class Corelyx connector — a `connection` node with this provider.
  | { status: "connector"; provider: string; label: string }
  // An AI model provider (OpenAI/Gemini/DeepSeek) — becomes an `agent` node,
  // not a connector.
  | { status: "agent"; label: string; note?: string }
  // We have no direct equivalent. `suggestion` names the closest connector, if
  // any; the converter turns these into clearly-labelled note nodes.
  | { status: "gap"; label: string; suggestion?: string; note?: string };

/**
 * Normalize a Relay app name/slug for lookup: lowercase, drop a trailing
 * parenthetical ("Quo (OpenPhone)" → "quo"), strip everything but a–z0–9.
 */
export function normalizeAppKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

// Explicit aliases for Relay app names whose normalized key does NOT already
// equal a Corelyx slug. Anything not here falls through to a direct slug match
// (so "trello", "shopify", "stripe", "monday", "linear"… resolve for free).
const EXPLICIT_APP_ALIASES: Record<string, RelayAppResolution> = {
  // Google suite — Relay names them "Google X".
  googlecalendar: { status: "connector", provider: "calendar", label: "Google Calendar" },
  googledocs: { status: "connector", provider: "docs", label: "Google Docs" },
  googledrive: { status: "connector", provider: "drive", label: "Google Drive" },
  googlesheets: { status: "connector", provider: "sheets", label: "Google Sheets" },
  googleforms: { status: "connector", provider: "googleforms", label: "Google Forms" },
  googlechat: { status: "connector", provider: "googlechat", label: "Google Chat" },
  googleanalytics: { status: "connector", provider: "googleanalytics", label: "Google Analytics" },

  // Microsoft.
  microsoftoutlookmail: { status: "connector", provider: "outlook", label: "Outlook Mail" },
  outlookmail: { status: "connector", provider: "outlook", label: "Outlook Mail" },
  microsoftonedrive: { status: "connector", provider: "onedrive", label: "OneDrive" },
  microsoftonenote: { status: "connector", provider: "onenote", label: "OneNote" },
  microsoftteams: { status: "connector", provider: "teams", label: "Microsoft Teams" },

  // Renamed / aliased products.
  kit: { status: "connector", provider: "convertkit", label: "Kit (ConvertKit)" },
  quo: { status: "connector", provider: "openphone", label: "Quo (OpenPhone)" },
  quickbooksonline: { status: "connector", provider: "quickbooks", label: "QuickBooks Online" },
  xtwitter: { status: "connector", provider: "twitter", label: "X (Twitter)" },
  x: { status: "connector", provider: "twitter", label: "X (Twitter)" },

  // AI model providers → agent nodes (Relay "AI steps").
  openai: { status: "agent", label: "OpenAI" },
  deepseek: { status: "agent", label: "DeepSeek" },
  gemini: { status: "agent", label: "Google Gemini", note: "Relay's Google AI Studio (Gemini)" },
  googleaistudio: { status: "agent", label: "Google Gemini", note: "Relay's Google AI Studio (Gemini)" },
  googleaistudiogemini: { status: "agent", label: "Google Gemini" },
  anthropic: { status: "agent", label: "Anthropic Claude" },
  claude: { status: "agent", label: "Anthropic Claude" },

  // Known gaps (no direct connector). Suggestion = nearest thing we do have.
  attio: { status: "gap", label: "Attio", suggestion: "hubspot", note: "No Attio connector — closest CRM is HubSpot/Salesforce/Pipedrive." },
  calcom: { status: "gap", label: "Cal.com", suggestion: "calendly", note: "No Cal.com connector — Calendly is the closest scheduler." },
  fathom: { status: "gap", label: "Fathom", note: "No meeting-notes connector." },
  fireflies: { status: "gap", label: "Fireflies", note: "No meeting-notes connector." },
  granola: { status: "gap", label: "Granola", note: "No meeting-notes connector." },
  indeed: { status: "gap", label: "Indeed", note: "No Indeed connector — Greenhouse/Lever/Workable cover ATS." },
  microsoftexcel: { status: "gap", label: "Microsoft Excel", suggestion: "sheets", note: "No Excel connector — Google Sheets is the closest spreadsheet." },
  microsoftplanner: { status: "gap", label: "Microsoft Planner", note: "No Planner connector." },
  microsoftoutlookcalendar: { status: "gap", label: "Outlook Calendar", note: "No Microsoft calendar connector (Outlook Mail is supported)." },
  googlegroups: { status: "gap", label: "Google Groups", note: "No Google Groups connector." },
  missive: { status: "gap", label: "Missive", suggestion: "front", note: "No Missive connector — Front is the closest shared inbox." },
  snowflake: { status: "gap", label: "Snowflake", note: "No Snowflake connector." },
};

// Nice display names for common direct-slug matches (so the preview doesn't
// show a bare lowercase slug). Not exhaustive — falls back to the raw name.
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  hubspot: "HubSpot", github: "GitHub", gitlab: "GitLab", quickbooks: "QuickBooks",
  openphone: "OpenPhone", convertkit: "ConvertKit", googleforms: "Google Forms",
  closecrm: "Close", zohocrm: "Zoho CRM", zohoprojects: "Zoho Projects",
  awss3: "AWS S3", wordpress: "WordPress", youtube: "YouTube", tiktok: "TikTok",
  linkedin: "LinkedIn", pagerduty: "PagerDuty", servicenow: "ServiceNow",
  activecampaign: "ActiveCampaign", mailchimp: "Mailchimp", clickup: "ClickUp",
};

function titleCase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Resolve a Relay app name/slug to how it maps into Corelyx. Returns null only
 * for empty/blank input — an unknown but non-empty app resolves to a `gap` so
 * the preview can still surface it as "needs manual attention".
 */
export function resolveRelayApp(raw: string): RelayAppResolution | null {
  if (typeof raw !== "string") return null;
  const key = normalizeAppKey(raw);
  if (!key) return null;

  if (EXPLICIT_APP_ALIASES[key]) return EXPLICIT_APP_ALIASES[key];

  if (CORELYX_PROVIDER_SLUGS.has(key)) {
    return {
      status: "connector",
      provider: key,
      label: PROVIDER_DISPLAY_NAMES[key] ?? titleCase(raw),
    };
  }

  return { status: "gap", label: titleCase(raw) };
}

// ─── Trigger + step type mapping ──────────────────────────────────────────────
// Relay trigger/step type strings → Corelyx equivalents. Used by the extractor
// (for the preview) and by the prompt addendum (to teach the model).

/** Relay trigger type → Corelyx TriggerConfig.trigger_type. */
export const RELAY_TRIGGER_MAP: Record<string, string> = {
  scheduled: "cron",
  schedule: "cron",
  scheduledtrigger: "cron",
  cron: "cron",
  recurring: "cron",
  webhook: "webhook",
  webhooktrigger: "webhook",
  http: "webhook",
  incomingwebhook: "webhook",
  mailhook: "webhook", // Relay's inbound email address → an inbound endpoint here
  email: "webhook",
  manual: "manual",
  manualtrigger: "manual",
  button: "manual",
  rss: "cron", // Corelyx has no RSS trigger — poll on a schedule
  rssfeed: "cron",
  batch: "manual",
};

/** Corelyx `step` logic_type values a Relay step can map to. */
export const RELAY_STEP_MAP: Record<string, string> = {
  paths: "branch",
  path: "branch",
  branch: "branch",
  condition: "branch",
  iterator: "loop",
  iterate: "loop",
  loop: "loop",
  foreach: "loop",
  wait: "delay",
  delay: "delay",
  sleep: "delay",
  transform: "transform",
  transformdata: "transform",
  formatter: "format",
  format: "format",
  createconstants: "transform",
  constants: "transform",
  parse: "parse",
  filter: "filter",
  sort: "sort",
  deduplicate: "deduplicate",
};

export type RelayConcept = {
  relay: string;
  corelyx: string;
  note?: string;
};

/**
 * Human/LLM-readable Relay→Corelyx concept map. Rendered verbatim into the
 * conversion prompt addendum, and available to the UI as a legend. Ordered
 * roughly trigger → step → app → gap.
 */
export const RELAY_CONCEPT_MAP: RelayConcept[] = [
  { relay: "Scheduled trigger", corelyx: "trigger node, trigger_type:cron", note: "carry the schedule + timezone into a five-field cron expression" },
  { relay: "Webhook trigger", corelyx: "trigger node, trigger_type:webhook" },
  { relay: "Manual trigger / button", corelyx: "trigger node, trigger_type:manual" },
  { relay: "Mailhook (inbound email address)", corelyx: "trigger node, trigger_type:webhook", note: "Corelyx has no mailhook; use a webhook endpoint and note that the user must forward mail to it" },
  { relay: "RSS trigger", corelyx: "trigger node, trigger_type:cron + an HTTP fetch step", note: "no native RSS trigger — poll the feed on a schedule" },
  { relay: "App action step", corelyx: "connection node (provider + operation + operation_params)" },
  { relay: "AI step / agentic tool use", corelyx: "agent node", note: "give it a system_prompt and an output_schema" },
  { relay: "Paths", corelyx: "step node, logic_type:branch" },
  { relay: "Iterator / loop", corelyx: "step node, logic_type:loop" },
  { relay: "Wait step", corelyx: "step node, logic_type:delay" },
  { relay: "Transform data / create constants", corelyx: "step node, logic_type:transform (or format/parse)" },
  { relay: "Human-in-the-loop review", corelyx: "execution_mode:approval_required (and/or an agent node requiring approval)" },
  { relay: "Custom HTTP request", corelyx: "connection node, connector_type:http" },
  { relay: "Scrape text from website", corelyx: "connection node, connector_type:http", note: "fetch the URL; there is no dedicated scraper" },
  { relay: "Search Google", corelyx: "connection node, connector_type:http", note: "no native Google Search step" },
  { relay: "Run custom code (JS)", corelyx: "GAP", note: "no code-execution node — approximate with a transform step or an HTTP call to the user's own endpoint, and flag it" },
  { relay: "Tables", corelyx: "GAP", note: "no built-in tables — suggest a Google Sheets / Airtable / Notion database instead, and flag it" },
  { relay: "Sequences", corelyx: "a separate program chained via a program_output trigger" },
  { relay: "MCP servers", corelyx: "SKIP for v1", note: "do not attempt to recreate MCP servers; note them for manual setup" },
];

/** The gap arm of RelayAppResolution — the only one that carries `suggestion`. */
export type RelayGapResolution = Extract<RelayAppResolution, { status: "gap" }>;

export type CoverageSummary = {
  covered: RelayAppResolution[];   // connector or agent
  gaps: RelayGapResolution[];      // no direct equivalent (narrowed so `.suggestion` is accessible)
};

/** Split a set of resolved apps into covered vs gap, deduped by label. */
export function summarizeCoverage(resolutions: Array<RelayAppResolution | null>): CoverageSummary {
  const seen = new Set<string>();
  const covered: RelayAppResolution[] = [];
  const gaps: RelayGapResolution[] = [];
  for (const res of resolutions) {
    if (!res) continue;
    if (seen.has(res.label)) continue;
    seen.add(res.label);
    if (res.status === "gap") gaps.push(res);
    else covered.push(res);
  }
  return { covered, gaps };
}

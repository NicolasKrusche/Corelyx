export const PROVIDER_CATEGORIES = [
  "database",
  "hosting",
  "email",
  "llm",
  "connector",
  "analytics",
  "payments",
  "orchestration",
  "storage",
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

export const PROVIDER_STATUSES = [
  "approved",
  "warning",
  "blocked",
  "customer_configured",
] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export type Provider = {
  id: string;
  name: string;
  category: ProviderCategory;
  purpose: string;
  default_region: string;
  available_regions: string[];
  eu_only_supported: boolean;
  data_categories_processed: string[];
  personal_data_allowed: boolean;
  stores_prompts: boolean;
  stores_outputs: boolean;
  trains_on_customer_data: boolean | "unknown";
  dpa_available: boolean;
  scc_available: boolean;
  transfer_basis: string;
  subprocessor_url: string;
  privacy_url: string;
  retention_notes: string;
  last_reviewed_at: string;
  status: ProviderStatus;
  optional: boolean;
  used_by_default: boolean;
  activation: string;
};

export const LAST_PROVIDER_REVIEWED_AT = "2026-05-27";

export const providerRegistry: Provider[] = [
  {
    id: "supabase",
    name: "Supabase",
    category: "database",
    purpose: "Database, authentication, realtime APIs, and Vault-backed secret references.",
    default_region: "Configured Supabase project region, expected EU for Corelyx production.",
    available_regions: ["eu-central-1", "eu-west-1", "us-east-1", "us-west-1", "ap-southeast-1"],
    eu_only_supported: true,
    data_categories_processed: ["Account data", "Workflow schemas", "Runs", "Approvals", "Connection metadata", "Secret references"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs where the configured project or subprocessors involve third-country processing.",
    subprocessor_url: "https://supabase.com/privacy",
    privacy_url: "https://supabase.com/privacy",
    retention_notes: "Controlled by Corelyx database retention settings and Supabase backup rotation.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "approved",
    optional: false,
    used_by_default: true,
    activation: "Always",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "hosting",
    purpose: "Hosts the Next.js web app, API routes, static assets, and deployment logs.",
    default_region: "Global CDN; server compute depends on project region configuration.",
    available_regions: ["fra1", "dub1", "iad1", "sfo1", "hnd1", "sin1"],
    eu_only_supported: true,
    data_categories_processed: ["Request metadata", "IP addresses", "Application logs", "Rendered application data"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and transfer addendum; EU-only support depends on project routing and log configuration.",
    subprocessor_url: "https://vercel.com/legal/subprocessors",
    privacy_url: "https://vercel.com/legal/privacy-policy",
    retention_notes: "Deployment and request logs follow Vercel account retention and Corelyx log minimisation settings.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: true,
    activation: "Always",
  },
  {
    id: "railway",
    name: "Railway",
    category: "hosting",
    purpose: "Hosts the Python workflow runtime used for execution steps.",
    default_region: "Configured Railway service region.",
    available_regions: ["EU West", "US West", "US East", "Singapore"],
    eu_only_supported: true,
    data_categories_processed: ["Workflow execution payloads", "Runtime logs", "Connector requests and responses"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs where the runtime or subprocessors involve third-country processing.",
    subprocessor_url: "https://railway.com/legal/subprocessors",
    privacy_url: "https://railway.com/legal/privacy",
    retention_notes: "Runtime logs are minimised and governed by workspace retention settings where technically available.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: true,
    activation: "Always",
  },
  {
    id: "inngest",
    name: "Inngest",
    category: "orchestration",
    purpose: "Schedules, retries, event dispatch, and asynchronous workflow orchestration.",
    default_region: "Provider-managed cloud location based on the configured Inngest account.",
    available_regions: ["Provider-managed"],
    eu_only_supported: false,
    data_categories_processed: ["Event metadata", "Function payloads", "Retry state", "Timing data"],
    personal_data_allowed: false,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs required if personal data is sent through orchestration events.",
    subprocessor_url: "https://www.inngest.com/legal/subprocessors",
    privacy_url: "https://www.inngest.com/privacy",
    retention_notes: "Event retention depends on the Inngest account and should not include secrets or full payloads in EU-only mode.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: true,
    activation: "Always",
  },
  {
    id: "resend",
    name: "Resend",
    category: "email",
    purpose: "Transactional email for approvals, failures, account, and billing notices.",
    default_region: "United States for account data, email metadata, logs, and API records.",
    available_regions: ["United States", "Sending region may vary by account"],
    eu_only_supported: false,
    data_categories_processed: ["Recipient email", "Sender details", "Subject lines", "Notification content"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs required for EEA personal data.",
    subprocessor_url: "https://resend.com/legal/subprocessors",
    privacy_url: "https://resend.com/legal/privacy-policy",
    retention_notes: "Provider email logs follow Resend retention; Corelyx avoids sending secrets in notifications.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: false,
    activation: "Only when transactional email is sent",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    purpose: "Checkout, subscriptions, invoices, payment processing, and fraud prevention.",
    default_region: "Provider-managed financial infrastructure.",
    available_regions: ["Provider-managed global infrastructure"],
    eu_only_supported: false,
    data_categories_processed: ["Billing contact data", "Subscription metadata", "Invoice records", "Payment and fraud signals"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA, SCCs, adequacy mechanisms, and payment-law processing roles depending on account setup.",
    subprocessor_url: "https://stripe.com/legal/service-providers",
    privacy_url: "https://stripe.com/privacy",
    retention_notes: "Billing and tax data is retained as required by law.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: false,
    activation: "Only when billing features are used",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "llm",
    purpose: "Optional model inference for workflow agent nodes and model operations.",
    default_region: "United States by default unless eligible European data residency is configured in the customer or platform account.",
    available_regions: ["United States", "Europe for eligible configured API projects"],
    eu_only_supported: true,
    data_categories_processed: ["Prompts", "System instructions", "Selected workflow inputs", "Model outputs", "Usage metadata"],
    personal_data_allowed: true,
    stores_prompts: true,
    stores_outputs: true,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs unless an eligible EU-resident project is verified for the workspace.",
    subprocessor_url: "https://openai.com/policies/sub-processors",
    privacy_url: "https://openai.com/policies/privacy-policy",
    retention_notes: "Retention depends on account, API project, abuse monitoring, and zero-data-retention settings.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "customer_configured",
    optional: true,
    used_by_default: false,
    activation: "Only when selected or configured",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "llm",
    purpose: "Optional model inference for workflow agent nodes.",
    default_region: "United States for customer data unless otherwise agreed.",
    available_regions: ["United States", "Traffic may route through multiple regions"],
    eu_only_supported: false,
    data_categories_processed: ["Prompts", "System instructions", "Selected workflow inputs", "Model outputs", "Usage metadata"],
    personal_data_allowed: true,
    stores_prompts: true,
    stores_outputs: true,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "DPA and SCCs required for EEA personal data.",
    subprocessor_url: "https://www.anthropic.com/legal/subprocessors",
    privacy_url: "https://www.anthropic.com/legal/privacy",
    retention_notes: "Commercial API retention is provider-controlled and subject to policy and abuse-monitoring exceptions.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: true,
    used_by_default: false,
    activation: "Only when selected or configured",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "llm",
    purpose: "LLM routing layer used by the Corelyx platform key to execute agent nodes. Also optionally used when a customer configures their own OpenRouter API key.",
    default_region: "Provider-managed global infrastructure. EU routing available on enterprise OpenRouter accounts.",
    available_regions: ["Provider-managed global routing", "EU routing for eligible enterprise configurations"],
    eu_only_supported: false,
    data_categories_processed: ["Prompts", "System instructions", "Selected workflow inputs", "Model outputs", "Provider routing metadata"],
    personal_data_allowed: true,
    stores_prompts: true,
    stores_outputs: true,
    trains_on_customer_data: "unknown",
    dpa_available: false,
    scc_available: false,
    transfer_basis: "No signed DPA or SCCs currently in place. Corelyx is pursuing an enterprise DPA with OpenRouter. Until completed, customers should treat OpenRouter as a third-country transfer risk and avoid routing special-category or high-risk personal data through the Corelyx platform key.",
    subprocessor_url: "https://openrouter.ai/privacy",
    privacy_url: "https://openrouter.ai/privacy",
    retention_notes: "OpenRouter states prompts are not used for training and are not retained beyond request processing by default. Verify current policy at openrouter.ai/privacy.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "warning",
    optional: false,
    used_by_default: true,
    activation: "Always active when using the Corelyx platform key. Also active when customer configures their own OpenRouter API key.",
  },
  {
    id: "google",
    name: "Google",
    category: "connector",
    purpose: "Google Sign-In (OAuth authentication available to all users). Optionally also used for Gmail, Calendar, Docs, Drive, and Sheets workflow actions when explicitly connected.",
    default_region: "Provider-managed; depends on Google account, Workspace region, and service.",
    available_regions: ["Provider-managed global infrastructure", "Customer tenant settings may provide regional controls"],
    eu_only_supported: true,
    data_categories_processed: ["Profile data and email address (Sign-In)", "Mailbox and file metadata (if connected)", "Message and document content (if connected)", "Calendar data (if connected)", "Workflow payloads (if connected)"],
    personal_data_allowed: true,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: false,
    dpa_available: true,
    scc_available: true,
    transfer_basis: "Google terms, DPA, SCCs, and customer tenant controls.",
    subprocessor_url: "https://cloud.google.com/terms/subprocessors",
    privacy_url: "https://policies.google.com/privacy",
    retention_notes: "Sign-In profile data retained for the life of the account. Connector data retention is controlled by the connected Google account or tenant.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "approved",
    optional: false,
    used_by_default: true,
    activation: "Sign-In available to all users. Workflow connectors only if explicitly connected by the customer.",
  },
  {
    id: "generic_http",
    name: "Customer-configured HTTP endpoint",
    category: "connector",
    purpose: "Customer-configured webhook or HTTP connector calls to arbitrary public endpoints.",
    default_region: "Customer-configured destination.",
    available_regions: ["Customer-configured"],
    eu_only_supported: false,
    data_categories_processed: ["Workflow payloads selected by the customer"],
    personal_data_allowed: false,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: "unknown",
    dpa_available: false,
    scc_available: false,
    transfer_basis: "Customer must document recipient, DPA, SCCs, and transfer basis before personal-data use.",
    subprocessor_url: "",
    privacy_url: "",
    retention_notes: "Retention is controlled by the customer-configured endpoint.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "blocked",
    optional: true,
    used_by_default: false,
    activation: "Only if enabled by the customer",
  },
];

const providerAliases: Record<string, string> = {
  gmail: "google",
  calendar: "google",
  docs: "google",
  drive: "google",
  sheets: "google",
  googleforms: "google",
  googlechat: "google",
  outlook: "microsoft",
  onedrive: "microsoft",
  teams: "microsoft",
  graph: "microsoft",
  http: "generic_http",
};

export function normalizeProviderId(providerId: string | null | undefined) {
  const id = (providerId ?? "").trim().toLowerCase();
  if (!id) return "";
  return providerAliases[id] ?? id;
}

export function getProvider(providerId: string | null | undefined): Provider | null {
  const normalized = normalizeProviderId(providerId);
  return providerRegistry.find((provider) => provider.id === normalized) ?? null;
}

export function getProviderOrUnknown(providerId: string | null | undefined): Provider {
  const normalized = normalizeProviderId(providerId) || "unknown";
  return getProvider(normalized) ?? {
    id: normalized,
    name: normalized === "unknown" ? "Unknown provider" : normalized,
    category: "connector",
    purpose: "Provider is not yet reviewed in the Corelyx registry.",
    default_region: "Unknown",
    available_regions: ["Unknown"],
    eu_only_supported: false,
    data_categories_processed: ["Workflow payloads"],
    personal_data_allowed: false,
    stores_prompts: false,
    stores_outputs: false,
    trains_on_customer_data: "unknown",
    dpa_available: false,
    scc_available: false,
    transfer_basis: "Missing provider review; treat as unresolved transfer risk.",
    subprocessor_url: "",
    privacy_url: "",
    retention_notes: "Unknown until reviewed.",
    last_reviewed_at: LAST_PROVIDER_REVIEWED_AT,
    status: "blocked",
    optional: true,
    used_by_default: false,
    activation: "Only if configured",
  };
}

export function providerLeavesEea(provider: Provider) {
  const region = provider.default_region.toLowerCase();
  if (region.includes("united states") || region.includes("global") || region.includes("provider-managed")) {
    return true;
  }
  if (region.includes("unknown") || region.includes("customer-configured")) {
    return true;
  }
  return false;
}

export function isProviderAllowedInEuOnly(provider: Provider) {
  return (
    provider.eu_only_supported &&
    provider.status !== "blocked" &&
    provider.dpa_available &&
    (provider.scc_available || !providerLeavesEea(provider))
  );
}

export function registryForPublicTables() {
  return providerRegistry;
}

export const LEGAL_LAST_UPDATED = "April 23, 2026";

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function combineParts(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

const postalCityLine = combineParts([
  readEnv("LEGAL_POSTAL_CODE"),
  readEnv("LEGAL_CITY"),
]);

export const legalIdentity = {
  entityName: readEnv("LEGAL_ENTITY_NAME") || "Corelyx",
  representative: readEnv("LEGAL_REPRESENTATIVE"),
  addressLines: [
    readEnv("LEGAL_ADDRESS_LINE_1"),
    readEnv("LEGAL_ADDRESS_LINE_2"),
    postalCityLine,
    readEnv("LEGAL_COUNTRY"),
  ].filter(Boolean),
  email: readEnv("LEGAL_EMAIL") || "legal@corelyx.app",
  vatId: readEnv("LEGAL_VAT_ID"),
  companyRegisterNo: readEnv("LEGAL_COMPANY_REGISTER_NO"),
};

export const privacyContactEmail =
  readEnv("PRIVACY_EMAIL") || "privacy@corelyx.app";

export interface ProcessorEntry {
  name: string;
  role: string;
  activation: string;
  purpose: string;
  categories: string;
  legalBasis: string;
  dataLocation: string;
  transferNotes: string;
  notes?: string;
}

export interface TextItem {
  title: string;
  body: string;
}

export const dataCategories: TextItem[] = [
  {
    title: "Account and identity data",
    body:
      "Email address, password hash if you use password login, and if you use Google Sign-In, the profile data Google returns to us such as name, email, and avatar.",
  },
  {
    title: "Program and workflow data",
    body:
      "Program schemas, prompts, node settings, execution modes, approvals, schedules, and version history you create inside Corelyx.",
  },
  {
    title: "Run, approval, and operational data",
    body:
      "Run status, node execution state, timestamps, token and cost metadata, approval records, and application logs needed to operate and troubleshoot the service.",
  },
  {
    title: "Connection and secret data",
    body:
      "Connection metadata plus encrypted OAuth tokens and API keys stored through Supabase Vault references so Corelyx can execute the integrations and model calls you configure.",
  },
  {
    title: "Billing and plan data",
    body:
      "Plan tier, Stripe customer or subscription references, checkout events, and legally required billing records.",
  },
];

export const legalBases: TextItem[] = [
  {
    title: "Art. 6(1)(b) GDPR - contract performance",
    body:
      "Used where processing is necessary to create your account, authenticate you, host the product, run your automations, send transactional notices, and provide billing or support you requested.",
  },
  {
    title: "Art. 6(1)(c) GDPR - legal obligation",
    body:
      "Used where we must retain invoice, tax, accounting, or compliance records, or respond to valid legal requests.",
  },
  {
    title: "Art. 6(1)(f) GDPR - legitimate interests",
    body:
      "Used for security monitoring, abuse prevention, incident response, backups, fraud prevention, and service reliability where those interests are not overridden by your rights.",
  },
];

export const coreServiceProviders: ProcessorEntry[] = [
  {
    name: "Supabase",
    role: "Processor / infrastructure provider",
    activation: "Always",
    purpose:
      "Database, authentication, encrypted secret storage, realtime features, and application data APIs.",
    categories:
      "Account data, auth identifiers, program definitions, connection metadata, encrypted secret references, approvals, runs, and logs.",
    legalBasis:
      "Art. 6(1)(b) GDPR for product operation; Art. 6(1)(f) GDPR for security, backups, and reliability.",
    dataLocation: readEnv("SUPABASE_REGION")
      ? `Project deployed in the ${readEnv("SUPABASE_REGION")} Supabase region. Supabase offers EU regions including Frankfurt (eu-central-1) and multiple non-EU AWS regions.`
      : "Project region chosen in Supabase. Supabase offers EU regions including Frankfurt (eu-central-1) and multiple non-EU AWS regions.",
    transferNotes:
      "If the project or any subprocessors are outside the EEA, UK, or Switzerland, third-country transfer safeguards such as the Supabase DPA and SCCs should be in place.",
  },
  {
    name: "Vercel",
    role: "Processor / web hosting provider",
    activation: "Always",
    purpose:
      "Hosts the Next.js frontend and server routes, serves static assets, and records deployment/runtime logs.",
    categories:
      "Request metadata, IP addresses, session-related requests, response logs, and application content rendered through the web app.",
    legalBasis:
      "Art. 6(1)(b) GDPR for hosting and delivery; Art. 6(1)(f) GDPR for security and uptime.",
    dataLocation:
      "Global CDN plus region-based compute. Vercel documents multiple compute-capable regions, and Functions default to iad1 (Washington, D.C., USA) unless configured otherwise.",
    transferNotes:
      "Expect international transfers unless you intentionally keep all relevant compute and storage in-region. Use the Vercel DPA and transfer addenda where required.",
  },
  {
    name: "Railway",
    role: "Processor / runtime hosting provider",
    activation: "Always",
    purpose:
      "Hosts the Python execution runtime that performs workflow steps against connected services and model providers.",
    categories:
      "Execution payloads, connector requests and responses, runtime logs, and temporary in-memory processing data.",
    legalBasis:
      "Art. 6(1)(b) GDPR for workflow execution; Art. 6(1)(f) GDPR for reliability and debugging.",
    dataLocation:
      "Selected Railway service region. Railway currently documents US West, US East, EU West (Amsterdam), and Singapore regions.",
    transferNotes:
      "If the runtime is deployed outside the EEA, UK, or Switzerland, appropriate transfer safeguards must cover that deployment.",
  },
  {
    name: "Inngest",
    role: "Processor / orchestration provider",
    activation: "Always",
    purpose:
      "Event delivery, retries, scheduling, approval timeout handling, and function-run orchestration.",
    categories:
      "Event payloads, function metadata, retry state, timing data, and observability data sent through the Inngest integration.",
    legalBasis:
      "Art. 6(1)(b) GDPR for workflow orchestration; Art. 6(1)(f) GDPR for resilience and monitoring.",
    dataLocation:
      "Provider-managed cloud location based on the configured Inngest project.",
    transferNotes:
      "Treat Inngest as a third-country transfer risk until the configured region and contractual safeguards are confirmed in the Inngest account.",
  },
  {
    name: "Resend",
    role: "Processor / transactional email provider",
    activation: "Only when transactional email is sent",
    purpose:
      "Sends approval, failure, and plan-related transactional emails from the web app.",
    categories:
      "Recipient email address, sender details, subject lines, and notification content.",
    legalBasis:
      "Art. 6(1)(b) GDPR for requested service notices; Art. 6(1)(f) GDPR for operational alerts.",
    dataLocation:
      "Resend allows email sending from multiple regions, but states that all account data, email metadata, logs, and API records are stored in the United States.",
    transferNotes:
      "Use the Resend DPA and account-level safeguards for EU, UK, or Swiss personal data sent through transactional email.",
  },
  {
    name: "Stripe",
    role: "Processor and, in some contexts, independent controller",
    activation: "Only when you start or manage a paid subscription",
    purpose:
      "Checkout, subscription billing, invoice generation, payment processing, fraud prevention, and billing event handling.",
    categories:
      "Billing contact data, plan and subscription identifiers, payment-related metadata, invoice records, and fraud-prevention signals.",
    legalBasis:
      "Art. 6(1)(b) GDPR for paid plans and invoicing; Art. 6(1)(c) GDPR for legal retention; Art. 6(1)(f) GDPR for fraud prevention.",
    dataLocation:
      "Provider-managed financial infrastructure. The exact storage or processing region depends on the Stripe account and legal entity setup and cannot be verified from this repository alone.",
    transferNotes:
      "Stripe provides a DPA plus transfer mechanisms such as SCCs and DPF-related disclosures. Review the exact Stripe account region and transfer setup separately.",
  },
];

export const connectedServices: ProcessorEntry[] = [
  {
    name: "Google (Google Sign-In, Gmail, Calendar, Docs, Drive, Sheets)",
    role: "User-selected connected service / recipient",
    activation:
      "Only if you sign in with Google or connect a Google service in a workflow",
    purpose:
      "Authenticate your account and execute the Google actions you explicitly configure in Corelyx.",
    categories:
      "Google profile data for sign-in, plus the content and metadata from the Google services and scopes you authorize.",
    legalBasis:
      "Art. 6(1)(b) GDPR because the processing is required to provide the login or automation flow you requested.",
    dataLocation:
      "Provider-managed. Processing location depends on your Google account, workspace settings, and Google's infrastructure.",
    transferNotes:
      "Google may process data globally. Check your Google Workspace or Google Cloud terms if you require regional controls.",
  },
  {
    name: "Slack",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Slack or send workflow data to Slack",
    purpose:
      "Read Slack data or post messages, channels, and webhook events at your direction.",
    categories:
      "Workspace identifiers, channel metadata, message content, and any payload you instruct Corelyx to send or read.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Storage and processing depend on the connected Slack workspace and Slack's infrastructure.",
    transferNotes:
      "Treat Slack as a separate recipient or service provider selected by you; review the Slack workspace's own data residency settings if required.",
  },
  {
    name: "Notion",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Notion or send workflow data to Notion",
    purpose:
      "Read, search, create, or update Notion pages and databases that you choose to expose to Corelyx.",
    categories:
      "Workspace metadata, page content, database rows, titles, rich text, and other objects in the shared Notion workspace.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on the connected Notion workspace and Notion's infrastructure.",
    transferNotes:
      "If Notion data contains third-party personal data, you remain responsible for having an appropriate legal basis to send it.",
  },
  {
    name: "GitHub",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect GitHub or run GitHub automation steps",
    purpose:
      "Read repositories or create issues, pull requests, comments, and webhooks at your direction.",
    categories:
      "Repository metadata, issue or PR content, comments, code-adjacent metadata, and webhook payloads.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on the connected GitHub account or organization and GitHub's infrastructure.",
    transferNotes:
      "GitHub is a separate service chosen by you. Review your GitHub organization settings and agreements if regional restrictions apply.",
  },
  {
    name: "Airtable",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Airtable or use Airtable workflow steps",
    purpose:
      "Read bases, records, and schemas or write new data into Airtable tables you authorize.",
    categories:
      "Base metadata, table schemas, records, fields, and webhook-related events.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on Airtable's infrastructure and any account-level residency features you have.",
    transferNotes:
      "Consider Airtable a separate recipient of the data you instruct Corelyx to send there.",
  },
  {
    name: "Asana",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Asana or use Asana workflow steps",
    purpose:
      "Read or create projects, tasks, and related events in Asana at your direction.",
    categories:
      "Workspace identifiers, task content, assignee data, due dates, comments, and webhook events.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on Asana's infrastructure and the connected workspace.",
    transferNotes:
      "If you automate HR, project, or customer data through Asana, you remain responsible for ensuring the connected workspace is lawfully configured.",
  },
  {
    name: "HubSpot",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect HubSpot or use HubSpot workflow steps",
    purpose:
      "Read or update contacts and related CRM information you explicitly choose to process.",
    categories:
      "Contact records, emails, names, phone numbers, companies, CRM metadata, and webhook events.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on the connected HubSpot account and HubSpot's infrastructure.",
    transferNotes:
      "CRM data often contains third-party personal data; ensure you have an appropriate basis before syncing or enriching it through Corelyx.",
  },
  {
    name: "Microsoft / Outlook (Microsoft Graph)",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Outlook or Microsoft 365 data",
    purpose:
      "Read and send Outlook email or related Microsoft Graph data at your direction.",
    categories:
      "Mailbox metadata, message bodies, recipients, subject lines, attachments metadata, and related Microsoft account information.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on the connected Microsoft tenant and Microsoft's infrastructure.",
    transferNotes:
      "Regional controls, if any, are determined by your Microsoft tenant rather than Corelyx.",
  },
  {
    name: "Typeform",
    role: "User-selected connected service / recipient",
    activation: "Only if you connect Typeform or process form responses",
    purpose:
      "Read form definitions, submissions, and webhook-triggered response data.",
    categories:
      "Form metadata, answer payloads, response identifiers, and any personal data collected in the connected form.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. Processing location depends on Typeform's infrastructure and your account settings.",
    transferNotes:
      "Form responses can be sensitive; only connect forms and fields you are authorized to process.",
  },
];

export const modelProviders: ProcessorEntry[] = [
  {
    name: "Anthropic",
    role: "User-selected model provider",
    activation: "Only if you add an Anthropic API key or route a node to Anthropic",
    purpose:
      "Inference for prompts, completions, structured outputs, and repair or planning steps that you configure.",
    categories:
      "Prompts, system instructions, tool context, selected workflow data, model outputs, and usage metadata.",
    legalBasis:
      "Art. 6(1)(b) GDPR because model calls happen only to provide the workflow behavior you request.",
    dataLocation:
      "Anthropic states that customer data is stored in the United States, while customer traffic may be routed through selected countries in the US, Europe, Asia, and Australia unless otherwise agreed.",
    transferNotes:
      "This is a third-country transfer by default for EEA, UK, or Swiss users. Anthropic states its commercial terms include a DPA with SCCs.",
    notes:
      "Anthropic states it does not use commercial API data to train models by default and normally deletes API inputs and outputs within 30 days, subject to exceptions such as legal requirements or abuse enforcement.",
  },
  {
    name: "OpenAI",
    role: "User-selected model provider",
    activation: "Only if you add an OpenAI API key or route a node to OpenAI",
    purpose:
      "Inference for prompts, completions, structured outputs, and other model operations you configure.",
    categories:
      "Prompts, system instructions, selected workflow data, outputs, and usage metadata.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. OpenAI documents US data residency by default and offers regional data residency options, including Europe, only for eligible API projects. No regional OpenAI project configuration is verifiable from this repository.",
    transferNotes:
      "If EU data residency is not separately enabled in your OpenAI account, treat OpenAI processing as a third-country transfer risk that requires the relevant DPA and transfer safeguards.",
  },
  {
    name: "OpenRouter",
    role: "User-selected model routing provider",
    activation: "Only if you add an OpenRouter key or route a node to OpenRouter",
    purpose:
      "Routes prompts and completions to the model endpoints you choose through the OpenRouter API.",
    categories:
      "Prompts, system instructions, selected workflow data, outputs, provider metadata, and logging metadata.",
    legalBasis: "Art. 6(1)(b) GDPR.",
    dataLocation:
      "Provider-managed. OpenRouter documents enterprise-only EU in-region routing via eu.openrouter.ai.",
    transferNotes:
      "OpenRouter can forward data to additional downstream model providers. You must review both OpenRouter's terms and the downstream provider policy for the model actually used.",
    notes:
      "OpenRouter exposes provider-specific retention controls and zero-data-retention filtering, but those settings are account-level choices outside this repository.",
  },
];

export const retentionItems: TextItem[] = [
  {
    title: "Account and program data",
    body:
      "Kept for the duration of your contract plus 7 years, as required by applicable tax and accounting law. You may delete your account at any time via account settings.",
  },
  {
    title: "Email and workflow content",
    body:
      "Content processed during workflow execution (e.g. email bodies) is used only to perform the automation you configured and is not stored beyond what is necessary for that processing.",
  },
  {
    title: "Encrypted OAuth tokens and API keys",
    body:
      "Deleted when you remove the corresponding connection or API key, or when your account is deleted. Account deletion automatically purges all associated Vault secrets before removing your user record.",
  },
  {
    title: "Run history and application logs",
    body:
      "Log data is retained for 90 days, after which it is deleted. Technical metadata such as IP addresses are anonymised after 7 days.",
  },
  {
    title: "Billing and tax records",
    body:
      "Retained for the periods required by applicable accounting, tax, and anti-fraud obligations.",
  },
  {
    title: "Anonymised usage statistics",
    body:
      "Aggregated, non-attributable usage data (no content) may be retained indefinitely for product improvement purposes. You may opt out in your account settings.",
  },
  {
    title: "Provider-side logs",
    body:
      "Third-party services and model providers may keep their own logs under their own retention schedules and contracts, which are outside Corelyx's direct control.",
  },
];

export const rightsItems: TextItem[] = [
  {
    title: "Access (Art. 15 GDPR)",
    body:
      "You can request confirmation of whether we process your personal data and ask for a copy of the data we control. We will respond within 30 days.",
  },
  {
    title: "Rectification (Art. 16 GDPR)",
    body:
      "You can correct inaccurate account data and ask us to fix or complete information that is wrong or incomplete.",
  },
  {
    title: "Erasure (Art. 17 GDPR)",
    body:
      "You can delete programs, connections, API keys, and your account directly in the product under Settings > Delete Account, or ask us to help complete deletion where external providers are involved.",
  },
  {
    title: "Restriction and objection (Art. 18 & 21 GDPR)",
    body:
      "You can object to processing based on legitimate interests or ask us to restrict processing where the GDPR permits it.",
  },
  {
    title: "Portability (Art. 20 GDPR)",
    body:
      "You can ask for a machine-readable export of the personal data we process for contract performance where the GDPR gives you that right.",
  },
  {
    title: "Complaint",
    body:
      "You can contact us first at privacy@corelyx.app. You also have the right to complain to the Austrian Data Protection Authority (Datenschutzbehörde): https://www.dsb.gv.at",
  },
  {
    title: "Data Processing Agreement (B2B)",
    body:
      "If you process personal data of your own customers or employees through the platform as part of your business, Corelyx acts as your processor (Art. 28 GDPR). A Data Processing Agreement (DPA) is available at /dpa and can be requested for signature at legal@corelyx.app.",
  },
];

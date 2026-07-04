"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  KeyRound,
  Lock,
  PlusCircle,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { friendlyResponseMessage } from "@/lib/friendly-errors";
import {
  getNextSecondaryConnectionName,
  getPrimaryConnectionName,
  isPrimaryConnectionName,
} from "@/lib/connection-utils";
import { PROVIDER_ICON_URL } from "@/lib/provider-icons";
import { PAY_PER_USE_PROVIDERS } from "@/lib/connector-tiers";

type Connection = {
  id: string;
  name: string;
  provider: string;
  auth_type: "oauth" | "api_key";
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
};

type Provider = {
  id: string;
  label: string;
  description: string;
  wave: 1 | 2 | 3;
  href: string;
};

type SettingsSection = "overview" | "accounts" | "primary" | "health" | "danger";

type SettingsNavItem = {
  id: SettingsSection;
  label: string;
  caption: string;
  icon: LucideIcon;
  group: "Connection" | "Management";
};

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  thunderbird: "Thunderbird / Email (IMAP)",
  sheets: "Google Sheets",
  slack: "Slack",
  notion: "Notion",
  calendar: "Google Calendar",
  airtable: "Airtable",
  hubspot: "HubSpot",
  docs: "Google Docs",
  github: "GitHub",
  typeform: "Typeform",
  asana: "Asana",
  drive: "Google Drive",
  outlook: "Outlook Mail",
  linear: "Linear",
  discord: "Discord",
  teams: "Microsoft Teams",
  jira: "Jira",
  salesforce: "Salesforce",
  trello: "Trello",
  zendesk: "Zendesk",
  intercom: "Intercom",
  stripe: "Stripe",
  shopify: "Shopify",
  dropbox: "Dropbox",
  mailchimp: "Mailchimp",
  zoom: "Zoom",
  calendly: "Calendly",
  gitlab: "GitLab",
  monday: "Monday.com",
  clickup: "ClickUp",
  todoist: "Todoist",
  basecamp: "Basecamp",
  pipedrive: "Pipedrive",
  freshdesk: "Freshdesk",
  front: "Front",
  klaviyo: "Klaviyo",
  activecampaign: "ActiveCampaign",
  sendgrid: "SendGrid",
  figma: "Figma",
  miro: "Miro",
  confluence: "Confluence",
  bitbucket: "Bitbucket",
  quickbooks: "QuickBooks",
  xero: "Xero",
  bamboohr: "BambooHR",
  gusto: "Gusto",
  docusign: "DocuSign",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  mixpanel: "Mixpanel",
  amplitude: "Amplitude",
  box: "Box",
  onedrive: "OneDrive",
  wordpress: "WordPress",
  webflow: "Webflow",
  loom: "Loom",
  pagerduty: "PagerDuty",
  sentry: "Sentry",
  twilio: "Twilio",
  whatsapp: "WhatsApp Business",
  facebook: "Facebook Pages",
  instagram: "Instagram Business",
  tiktok: "TikTok for Business",
  youtube: "YouTube",
  pinterest: "Pinterest",
  reddit: "Reddit",
  buffer: "Buffer",
  hootsuite: "Hootsuite",
  resend: "Resend",
  brevo: "Brevo",
  convertkit: "ConvertKit",
  constantcontact: "Constant Contact",
  drip: "Drip",
  customerio: "Customer.io",
  braze: "Braze",
  iterable: "Iterable",
  postmark: "Postmark",
  beehiiv: "Beehiiv",
  campaignmonitor: "Campaign Monitor",
  zohocrm: "Zoho CRM",
  copper: "Copper",
  closecrm: "Close CRM",
  freshsales: "Freshsales",
  insightly: "Insightly",
  nutshell: "Nutshell",
  keap: "Keap",
  wrike: "Wrike",
  smartsheet: "Smartsheet",
  coda: "Coda",
  height: "Height",
  nifty: "Nifty",
  teamwork: "Teamwork",
  zohoprojects: "Zoho Projects",
  vercel: "Vercel",
  netlify: "Netlify",
  circleci: "CircleCI",
  datadog: "Datadog",
  newrelic: "New Relic",
  cloudflare: "Cloudflare",
  firebase: "Firebase",
  supabase: "Supabase",
  heroku: "Heroku",
  render: "Render",
  digitalocean: "DigitalOcean",
  grafana: "Grafana",
  helpscout: "Help Scout",
  gorgias: "Gorgias",
  freshservice: "Freshservice",
  kustomer: "Kustomer",
  crisp: "Crisp",
  drift: "Drift",
  rippling: "Rippling",
  workday: "Workday",
  greenhouse: "Greenhouse",
  lever: "Lever",
  personio: "Personio",
  deel: "Deel",
  hibob: "HiBob",
  lattice: "Lattice",
  workable: "Workable",
  freshbooks: "FreshBooks",
  paddle: "Paddle",
  paypal: "PayPal",
  chargebee: "Chargebee",
  recurly: "Recurly",
  brex: "Brex",
  ramp: "Ramp",
  expensify: "Expensify",
  mollie: "Mollie",
  gocardless: "GoCardless",
  square: "Square",
  lemonsqueezy: "Lemon Squeezy",
  netsuite: "NetSuite",
  googleanalytics: "Google Analytics",
  posthog: "PostHog",
  heap: "Heap",
  hotjar: "Hotjar",
  segment: "Segment",
  plausible: "Plausible",
  fullstory: "FullStory",
  rudderstack: "RudderStack",
  canva: "Canva",
  framer: "Framer",
  invision: "InVision",
  zeplin: "Zeplin",
  pandadoc: "PandaDoc",
  hellosign: "Dropbox Sign",
  surveymonkey: "SurveyMonkey",
  jotform: "Jotform",
  tally: "Tally",
  googleforms: "Google Forms",
  paperform: "Paperform",
  cloudinary: "Cloudinary",
  awss3: "AWS S3",
  vimeo: "Vimeo",
  wistia: "Wistia",
  mux: "Mux",
  adyen: "Adyen",
  braintree: "Braintree",
  acuityscheduling: "Acuity Scheduling",
  doodle: "Doodle",
  simplybook: "SimplyBook.me",
  eventbrite: "Eventbrite",
  luma: "Luma",
  ringcentral: "RingCentral",
  aircall: "Aircall",
  openphone: "OpenPhone",
  vonage: "Vonage",
  dialpad: "Dialpad",
  telnyx: "Telnyx",
  openai: "OpenAI",
  replicate: "Replicate",
  cohere: "Cohere",
  pinecone: "Pinecone",
  okta: "Okta",
  auth0: "Auth0",
  jumpcloud: "JumpCloud",
  apollo: "Apollo.io",
  clearbit: "Clearbit",
  hunter: "Hunter.io",
  zoominfo: "ZoomInfo",
  lusha: "Lusha",
  contentful: "Contentful",
  sanity: "Sanity",
  ghost: "Ghost",
  storyblok: "Storyblok",
  prismic: "Prismic",
  toggl: "Toggl",
  harvest: "Harvest",
  clockify: "Clockify",
  hubstaff: "Hubstaff",
  servicenow: "ServiceNow",
  opsgenie: "OpsGenie",
  evernote: "Evernote",
  onenote: "OneNote",
  nuclino: "Nuclino",
  telegram: "Telegram",
  webex: "Cisco Webex",
  googlechat: "Google Chat",
  rocketchat: "Rocket.Chat",
  semrush: "Semrush",
  ahrefs: "Ahrefs",
};


// PAY_PER_USE_PROVIDERS imported from @/lib/connector-tiers — providers that
// bill the user's own external account per usage (Stripe, Twilio, OpenAI, etc.).
// Connecting them requires Solo plan or higher.

const POPULAR_PROVIDER_IDS = ["gmail", "slack", "notion", "sheets", "hubspot", "github", "asana", "drive"];

const AVAILABLE_PROVIDERS: Provider[] = [
  { id: "gmail", label: "Gmail", description: "Send and read emails", wave: 1, href: "/api/connections/oauth/gmail?label=gmail:primary" },
  { id: "sheets", label: "Google Sheets", description: "Read and write spreadsheet data", wave: 1, href: "/api/connections/oauth/google?service=sheets&label=sheets:primary" },
  { id: "slack", label: "Slack", description: "Post messages and read channels", wave: 1, href: "/api/connections/oauth/slack?label=slack:primary" },
  { id: "notion", label: "Notion", description: "Read and write pages and databases", wave: 1, href: "/api/connections/oauth/notion?label=notion:primary" },
  { id: "calendar", label: "Google Calendar", description: "Read and create calendar events", wave: 1, href: "/api/connections/oauth/google?service=calendar&label=calendar:primary" },
  { id: "airtable", label: "Airtable", description: "Read and write Airtable bases", wave: 1, href: "/api/connections/oauth/airtable?label=airtable:primary" },
  { id: "hubspot", label: "HubSpot", description: "Manage contacts, deals, and content", wave: 1, href: "/api/connections/oauth/hubspot?label=hubspot:primary" },
  { id: "docs", label: "Google Docs", description: "Read and write documents", wave: 1, href: "/api/connections/oauth/google?service=docs&label=docs:primary" },
  { id: "github", label: "GitHub", description: "Create issues, PRs, and read repos", wave: 2, href: "/api/connections/oauth/github?label=github:primary" },
  { id: "typeform", label: "Typeform", description: "Read form responses and definitions", wave: 2, href: "/api/connections/oauth/typeform?label=typeform:primary" },
  { id: "asana", label: "Asana", description: "Manage tasks and projects", wave: 2, href: "/api/connections/oauth/asana?label=asana:primary" },
  { id: "drive", label: "Google Drive", description: "Read and manage Drive files", wave: 2, href: "/api/connections/oauth/google?service=drive&label=drive:primary" },
  { id: "outlook", label: "Outlook Mail", description: "Send and read Outlook email", wave: 2, href: "/api/connections/oauth/outlook?label=outlook:primary" },
  { id: "thunderbird", label: "Thunderbird / Email (IMAP)", description: "Any IMAP/SMTP mailbox — read, search, and send", wave: 2, href: "/api/connections/oauth/thunderbird?label=thunderbird:primary" },
  { id: "linear", label: "Linear", description: "Create and manage issues and projects", wave: 3, href: "/api/connections/oauth/linear?label=linear:primary" },
  { id: "discord", label: "Discord", description: "Send messages and read channels", wave: 3, href: "/api/connections/oauth/discord?label=discord:primary" },
  { id: "teams", label: "Microsoft Teams", description: "Post messages and manage channels", wave: 3, href: "/api/connections/oauth/teams?label=teams:primary" },
  { id: "jira", label: "Jira", description: "Create and update issues and sprints", wave: 3, href: "/api/connections/oauth/jira?label=jira:primary" },
  { id: "salesforce", label: "Salesforce", description: "Read and write CRM records and leads", wave: 3, href: "/api/connections/oauth/salesforce?label=salesforce:primary" },
  { id: "trello", label: "Trello", description: "Manage boards, lists, and cards", wave: 3, href: "/api/connections/oauth/trello?label=trello:primary" },
  { id: "zendesk", label: "Zendesk", description: "Create and update support tickets", wave: 3, href: "/api/connections/oauth/zendesk?label=zendesk:primary" },
  { id: "intercom", label: "Intercom", description: "Manage conversations and contacts", wave: 3, href: "/api/connections/oauth/intercom?label=intercom:primary" },
  { id: "stripe", label: "Stripe", description: "Read payments, customers, and subscriptions", wave: 3, href: "/api/connections/oauth/stripe?label=stripe:primary" },
  { id: "shopify", label: "Shopify", description: "Read and manage orders, products, and customers", wave: 3, href: "/api/connections/oauth/shopify?label=shopify:primary" },
  { id: "dropbox", label: "Dropbox", description: "Read and manage files and folders", wave: 3, href: "/api/connections/oauth/dropbox?label=dropbox:primary" },
  { id: "mailchimp", label: "Mailchimp", description: "Manage audiences, campaigns, and members", wave: 3, href: "/api/connections/oauth/mailchimp?label=mailchimp:primary" },
  { id: "zoom", label: "Zoom", description: "Create and manage meetings and recordings", wave: 3, href: "/api/connections/oauth/zoom?label=zoom:primary" },
  { id: "calendly", label: "Calendly", description: "Read scheduled events and invitees", wave: 3, href: "/api/connections/oauth/calendly?label=calendly:primary" },
  { id: "gitlab", label: "GitLab", description: "Manage repos, issues, and merge requests", wave: 3, href: "/api/connections/oauth/gitlab?label=gitlab:primary" },
  { id: "monday", label: "Monday.com", description: "Manage boards, items, and workflows", wave: 3, href: "/api/connections/oauth/monday?label=monday:primary" },
  { id: "clickup", label: "ClickUp", description: "Create tasks, docs, and manage workspaces", wave: 3, href: "/api/connections/oauth/clickup?label=clickup:primary" },
  { id: "todoist", label: "Todoist", description: "Create and manage tasks and projects", wave: 3, href: "/api/connections/oauth/todoist?label=todoist:primary" },
  { id: "basecamp", label: "Basecamp", description: "Manage projects, to-dos, and messages", wave: 3, href: "/api/connections/oauth/basecamp?label=basecamp:primary" },
  { id: "pipedrive", label: "Pipedrive", description: "Manage deals, contacts, and pipeline stages", wave: 3, href: "/api/connections/oauth/pipedrive?label=pipedrive:primary" },
  { id: "freshdesk", label: "Freshdesk", description: "Create and update support tickets and agents", wave: 3, href: "/api/connections/oauth/freshdesk?label=freshdesk:primary" },
  { id: "front", label: "Front", description: "Read and reply to shared inbox conversations", wave: 3, href: "/api/connections/oauth/front?label=front:primary" },
  { id: "klaviyo", label: "Klaviyo", description: "Manage lists, campaigns, and events", wave: 3, href: "/api/connections/oauth/klaviyo?label=klaviyo:primary" },
  { id: "activecampaign", label: "ActiveCampaign", description: "Manage contacts, automations, and campaigns", wave: 3, href: "/api/connections/oauth/activecampaign?label=activecampaign:primary" },
  { id: "sendgrid", label: "SendGrid", description: "Send transactional and marketing emails", wave: 3, href: "/api/connections/oauth/sendgrid?label=sendgrid:primary" },
  { id: "figma", label: "Figma", description: "Read files, comments, and project metadata", wave: 3, href: "/api/connections/oauth/figma?label=figma:primary" },
  { id: "miro", label: "Miro", description: "Read and update boards and cards", wave: 3, href: "/api/connections/oauth/miro?label=miro:primary" },
  { id: "confluence", label: "Confluence", description: "Read and write pages and spaces", wave: 3, href: "/api/connections/oauth/confluence?label=confluence:primary" },
  { id: "bitbucket", label: "Bitbucket", description: "Manage repos, pull requests, and pipelines", wave: 3, href: "/api/connections/oauth/bitbucket?label=bitbucket:primary" },
  { id: "quickbooks", label: "QuickBooks", description: "Read invoices, expenses, and customers", wave: 3, href: "/api/connections/oauth/quickbooks?label=quickbooks:primary" },
  { id: "xero", label: "Xero", description: "Read and create invoices and contacts", wave: 3, href: "/api/connections/oauth/xero?label=xero:primary" },
  { id: "bamboohr", label: "BambooHR", description: "Read employee records and time-off data", wave: 3, href: "/api/connections/oauth/bamboohr?label=bamboohr:primary" },
  { id: "gusto", label: "Gusto", description: "Read payroll, employees, and company data", wave: 3, href: "/api/connections/oauth/gusto?label=gusto:primary" },
  { id: "docusign", label: "DocuSign", description: "Send envelopes and track signature status", wave: 3, href: "/api/connections/oauth/docusign?label=docusign:primary" },
  { id: "twitter", label: "X (Twitter)", description: "Post tweets and read timelines and mentions", wave: 3, href: "/api/connections/oauth/twitter?label=twitter:primary" },
  { id: "linkedin", label: "LinkedIn", description: "Post updates and read profile and company data", wave: 3, href: "/api/connections/oauth/linkedin?label=linkedin:primary" },
  { id: "mixpanel", label: "Mixpanel", description: "Track events and query analytics data", wave: 3, href: "/api/connections/oauth/mixpanel?label=mixpanel:primary" },
  { id: "amplitude", label: "Amplitude", description: "Query charts, cohorts, and event data", wave: 3, href: "/api/connections/oauth/amplitude?label=amplitude:primary" },
  { id: "box", label: "Box", description: "Read and manage files, folders, and metadata", wave: 3, href: "/api/connections/oauth/box?label=box:primary" },
  { id: "onedrive", label: "OneDrive", description: "Read and manage files and folders", wave: 3, href: "/api/connections/oauth/onedrive?label=onedrive:primary" },
  { id: "wordpress", label: "WordPress", description: "Create and manage posts, pages, and media", wave: 3, href: "/api/connections/oauth/wordpress?label=wordpress:primary" },
  { id: "webflow", label: "Webflow", description: "Read and update CMS items and site data", wave: 3, href: "/api/connections/oauth/webflow?label=webflow:primary" },
  { id: "loom", label: "Loom", description: "Create and share video recordings", wave: 3, href: "/api/connections/oauth/loom?label=loom:primary" },
  { id: "pagerduty", label: "PagerDuty", description: "Create incidents and manage on-call schedules", wave: 3, href: "/api/connections/oauth/pagerduty?label=pagerduty:primary" },
  { id: "sentry", label: "Sentry", description: "Read issues, events, and project alerts", wave: 3, href: "/api/connections/oauth/sentry?label=sentry:primary" },
  { id: "twilio", label: "Twilio", description: "Send SMS, WhatsApp, and voice messages", wave: 3, href: "/api/connections/oauth/twilio?label=twilio:primary" },
  { id: "whatsapp", label: "WhatsApp Business", description: "Send and receive business messages", wave: 3, href: "/api/connections/oauth/whatsapp?label=whatsapp:primary" },
  { id: "facebook", label: "Facebook Pages", description: "Post updates and read page insights", wave: 3, href: "/api/connections/oauth/facebook?label=facebook:primary" },
  { id: "instagram", label: "Instagram Business", description: "Post content and read account insights", wave: 3, href: "/api/connections/oauth/instagram?label=instagram:primary" },
  { id: "tiktok", label: "TikTok for Business", description: "Manage ads and read analytics", wave: 3, href: "/api/connections/oauth/tiktok?label=tiktok:primary" },
  { id: "youtube", label: "YouTube", description: "Upload videos and read channel analytics", wave: 3, href: "/api/connections/oauth/youtube?label=youtube:primary" },
  { id: "pinterest", label: "Pinterest", description: "Create pins and manage boards", wave: 3, href: "/api/connections/oauth/pinterest?label=pinterest:primary" },
  { id: "reddit", label: "Reddit", description: "Post to subreddits and read threads", wave: 3, href: "/api/connections/oauth/reddit?label=reddit:primary" },
  { id: "buffer", label: "Buffer", description: "Schedule posts across social channels", wave: 3, href: "/api/connections/oauth/buffer?label=buffer:primary" },
  { id: "hootsuite", label: "Hootsuite", description: "Schedule and publish social content", wave: 3, href: "/api/connections/oauth/hootsuite?label=hootsuite:primary" },
  { id: "resend", label: "Resend", description: "Send transactional emails via API", wave: 3, href: "/api/connections/oauth/resend?label=resend:primary" },
  { id: "brevo", label: "Brevo", description: "Send email, SMS, and manage contacts", wave: 3, href: "/api/connections/oauth/brevo?label=brevo:primary" },
  { id: "convertkit", label: "ConvertKit", description: "Manage subscribers, forms, and sequences", wave: 3, href: "/api/connections/oauth/convertkit?label=convertkit:primary" },
  { id: "constantcontact", label: "Constant Contact", description: "Send campaigns and manage lists", wave: 3, href: "/api/connections/oauth/constantcontact?label=constantcontact:primary" },
  { id: "drip", label: "Drip", description: "Manage subscribers and e-commerce automations", wave: 3, href: "/api/connections/oauth/drip?label=drip:primary" },
  { id: "customerio", label: "Customer.io", description: "Trigger campaigns and manage customer profiles", wave: 3, href: "/api/connections/oauth/customerio?label=customerio:primary" },
  { id: "braze", label: "Braze", description: "Send push, email, and in-app messages", wave: 3, href: "/api/connections/oauth/braze?label=braze:primary" },
  { id: "iterable", label: "Iterable", description: "Manage users, events, and campaigns", wave: 3, href: "/api/connections/oauth/iterable?label=iterable:primary" },
  { id: "postmark", label: "Postmark", description: "Send transactional emails and read bounces", wave: 3, href: "/api/connections/oauth/postmark?label=postmark:primary" },
  { id: "beehiiv", label: "Beehiiv", description: "Manage newsletter subscribers and posts", wave: 3, href: "/api/connections/oauth/beehiiv?label=beehiiv:primary" },
  { id: "campaignmonitor", label: "Campaign Monitor", description: "Send campaigns and manage subscriber lists", wave: 3, href: "/api/connections/oauth/campaignmonitor?label=campaignmonitor:primary" },
  { id: "zohocrm", label: "Zoho CRM", description: "Manage leads, contacts, and deals", wave: 3, href: "/api/connections/oauth/zohocrm?label=zohocrm:primary" },
  { id: "copper", label: "Copper", description: "Manage contacts, leads, and opportunities", wave: 3, href: "/api/connections/oauth/copper?label=copper:primary" },
  { id: "closecrm", label: "Close CRM", description: "Manage leads, contacts, and calls", wave: 3, href: "/api/connections/oauth/closecrm?label=closecrm:primary" },
  { id: "freshsales", label: "Freshsales", description: "Manage contacts, deals, and pipelines", wave: 3, href: "/api/connections/oauth/freshsales?label=freshsales:primary" },
  { id: "insightly", label: "Insightly", description: "Manage contacts, projects, and pipelines", wave: 3, href: "/api/connections/oauth/insightly?label=insightly:primary" },
  { id: "nutshell", label: "Nutshell", description: "Manage contacts, leads, and timelines", wave: 3, href: "/api/connections/oauth/nutshell?label=nutshell:primary" },
  { id: "keap", label: "Keap", description: "Manage contacts, automations, and invoices", wave: 3, href: "/api/connections/oauth/keap?label=keap:primary" },
  { id: "wrike", label: "Wrike", description: "Manage tasks, folders, and projects", wave: 3, href: "/api/connections/oauth/wrike?label=wrike:primary" },
  { id: "smartsheet", label: "Smartsheet", description: "Read and write sheets, rows, and reports", wave: 3, href: "/api/connections/oauth/smartsheet?label=smartsheet:primary" },
  { id: "coda", label: "Coda", description: "Read and update docs, tables, and rows", wave: 3, href: "/api/connections/oauth/coda?label=coda:primary" },
  { id: "height", label: "Height", description: "Create and manage tasks and projects", wave: 3, href: "/api/connections/oauth/height?label=height:primary" },
  { id: "nifty", label: "Nifty", description: "Manage milestones, tasks, and projects", wave: 3, href: "/api/connections/oauth/nifty?label=nifty:primary" },
  { id: "teamwork", label: "Teamwork", description: "Manage projects, tasks, and time logs", wave: 3, href: "/api/connections/oauth/teamwork?label=teamwork:primary" },
  { id: "zohoprojects", label: "Zoho Projects", description: "Manage projects, milestones, and bugs", wave: 3, href: "/api/connections/oauth/zohoprojects?label=zohoprojects:primary" },
  { id: "vercel", label: "Vercel", description: "Trigger deploys and read deployment status", wave: 3, href: "/api/connections/oauth/vercel?label=vercel:primary" },
  { id: "netlify", label: "Netlify", description: "Trigger builds and read site analytics", wave: 3, href: "/api/connections/oauth/netlify?label=netlify:primary" },
  { id: "circleci", label: "CircleCI", description: "Trigger pipelines and read build status", wave: 3, href: "/api/connections/oauth/circleci?label=circleci:primary" },
  { id: "datadog", label: "Datadog", description: "Read metrics, logs, and create monitors", wave: 3, href: "/api/connections/oauth/datadog?label=datadog:primary" },
  { id: "newrelic", label: "New Relic", description: "Query metrics, traces, and alerts", wave: 3, href: "/api/connections/oauth/newrelic?label=newrelic:primary" },
  { id: "cloudflare", label: "Cloudflare", description: "Manage DNS, Workers, and analytics", wave: 3, href: "/api/connections/oauth/cloudflare?label=cloudflare:primary" },
  { id: "firebase", label: "Firebase", description: "Read and write Firestore and manage users", wave: 3, href: "/api/connections/oauth/firebase?label=firebase:primary" },
  { id: "supabase", label: "Supabase", description: "Query database tables and manage auth users", wave: 3, href: "/api/connections/oauth/supabase?label=supabase:primary" },
  { id: "heroku", label: "Heroku", description: "Manage apps, dynos, and deployments", wave: 3, href: "/api/connections/oauth/heroku?label=heroku:primary" },
  { id: "render", label: "Render", description: "Trigger deploys and manage services", wave: 3, href: "/api/connections/oauth/render?label=render:primary" },
  { id: "digitalocean", label: "DigitalOcean", description: "Manage droplets, apps, and databases", wave: 3, href: "/api/connections/oauth/digitalocean?label=digitalocean:primary" },
  { id: "grafana", label: "Grafana", description: "Query dashboards and manage alerts", wave: 3, href: "/api/connections/oauth/grafana?label=grafana:primary" },
  { id: "helpscout", label: "Help Scout", description: "Manage conversations, mailboxes, and customers", wave: 3, href: "/api/connections/oauth/helpscout?label=helpscout:primary" },
  { id: "gorgias", label: "Gorgias", description: "Manage support tickets for e-commerce", wave: 3, href: "/api/connections/oauth/gorgias?label=gorgias:primary" },
  { id: "freshservice", label: "Freshservice", description: "Manage IT tickets, assets, and changes", wave: 3, href: "/api/connections/oauth/freshservice?label=freshservice:primary" },
  { id: "kustomer", label: "Kustomer", description: "Manage customers, conversations, and workflows", wave: 3, href: "/api/connections/oauth/kustomer?label=kustomer:primary" },
  { id: "crisp", label: "Crisp", description: "Manage live chat conversations and contacts", wave: 3, href: "/api/connections/oauth/crisp?label=crisp:primary" },
  { id: "drift", label: "Drift", description: "Manage conversations and qualify leads", wave: 3, href: "/api/connections/oauth/drift?label=drift:primary" },
  { id: "rippling", label: "Rippling", description: "Read employee, payroll, and device data", wave: 3, href: "/api/connections/oauth/rippling?label=rippling:primary" },
  { id: "workday", label: "Workday", description: "Read HR, payroll, and workforce data", wave: 3, href: "/api/connections/oauth/workday?label=workday:primary" },
  { id: "greenhouse", label: "Greenhouse", description: "Manage jobs, candidates, and interviews", wave: 3, href: "/api/connections/oauth/greenhouse?label=greenhouse:primary" },
  { id: "lever", label: "Lever", description: "Manage candidates, opportunities, and postings", wave: 3, href: "/api/connections/oauth/lever?label=lever:primary" },
  { id: "personio", label: "Personio", description: "Read employees, absences, and recruitments", wave: 3, href: "/api/connections/oauth/personio?label=personio:primary" },
  { id: "deel", label: "Deel", description: "Manage contractors, payroll, and contracts", wave: 3, href: "/api/connections/oauth/deel?label=deel:primary" },
  { id: "hibob", label: "HiBob", description: "Read people, time-off, and org structure", wave: 3, href: "/api/connections/oauth/hibob?label=hibob:primary" },
  { id: "lattice", label: "Lattice", description: "Manage reviews, goals, and feedback", wave: 3, href: "/api/connections/oauth/lattice?label=lattice:primary" },
  { id: "workable", label: "Workable", description: "Manage job postings and candidates", wave: 3, href: "/api/connections/oauth/workable?label=workable:primary" },
  { id: "freshbooks", label: "FreshBooks", description: "Manage invoices, expenses, and clients", wave: 3, href: "/api/connections/oauth/freshbooks?label=freshbooks:primary" },
  { id: "paddle", label: "Paddle", description: "Read subscriptions, transactions, and customers", wave: 3, href: "/api/connections/oauth/paddle?label=paddle:primary" },
  { id: "paypal", label: "PayPal", description: "Read transactions, invoices, and payouts", wave: 3, href: "/api/connections/oauth/paypal?label=paypal:primary" },
  { id: "chargebee", label: "Chargebee", description: "Manage subscriptions, invoices, and customers", wave: 3, href: "/api/connections/oauth/chargebee?label=chargebee:primary" },
  { id: "recurly", label: "Recurly", description: "Manage subscriptions and billing accounts", wave: 3, href: "/api/connections/oauth/recurly?label=recurly:primary" },
  { id: "brex", label: "Brex", description: "Read spend, cards, and transactions", wave: 3, href: "/api/connections/oauth/brex?label=brex:primary" },
  { id: "ramp", label: "Ramp", description: "Read spend, receipts, and card data", wave: 3, href: "/api/connections/oauth/ramp?label=ramp:primary" },
  { id: "expensify", label: "Expensify", description: "Create reports and manage expenses", wave: 3, href: "/api/connections/oauth/expensify?label=expensify:primary" },
  { id: "mollie", label: "Mollie", description: "Read payments, orders, and refunds", wave: 3, href: "/api/connections/oauth/mollie?label=mollie:primary" },
  { id: "gocardless", label: "GoCardless", description: "Manage mandates and direct debit payments", wave: 3, href: "/api/connections/oauth/gocardless?label=gocardless:primary" },
  { id: "square", label: "Square", description: "Read sales, inventory, and customer data", wave: 3, href: "/api/connections/oauth/square?label=square:primary" },
  { id: "lemonsqueezy", label: "Lemon Squeezy", description: "Manage products, orders, and subscriptions", wave: 3, href: "/api/connections/oauth/lemonsqueezy?label=lemonsqueezy:primary" },
  { id: "netsuite", label: "NetSuite", description: "Read financial records and ERP data", wave: 3, href: "/api/connections/oauth/netsuite?label=netsuite:primary" },
  { id: "googleanalytics", label: "Google Analytics", description: "Query traffic, events, and conversions", wave: 3, href: "/api/connections/oauth/googleanalytics?label=googleanalytics:primary" },
  { id: "posthog", label: "PostHog", description: "Query events, funnels, and feature flags", wave: 3, href: "/api/connections/oauth/posthog?label=posthog:primary" },
  { id: "heap", label: "Heap", description: "Query user events and behavioral data", wave: 3, href: "/api/connections/oauth/heap?label=heap:primary" },
  { id: "hotjar", label: "Hotjar", description: "Read heatmaps, recordings, and feedback", wave: 3, href: "/api/connections/oauth/hotjar?label=hotjar:primary" },
  { id: "segment", label: "Segment", description: "Track events and manage customer data", wave: 3, href: "/api/connections/oauth/segment?label=segment:primary" },
  { id: "plausible", label: "Plausible", description: "Query privacy-friendly site analytics", wave: 3, href: "/api/connections/oauth/plausible?label=plausible:primary" },
  { id: "fullstory", label: "FullStory", description: "Read sessions, events, and user journeys", wave: 3, href: "/api/connections/oauth/fullstory?label=fullstory:primary" },
  { id: "rudderstack", label: "RudderStack", description: "Track events and sync customer data", wave: 3, href: "/api/connections/oauth/rudderstack?label=rudderstack:primary" },
  { id: "canva", label: "Canva", description: "Create and export designs from templates", wave: 3, href: "/api/connections/oauth/canva?label=canva:primary" },
  { id: "framer", label: "Framer", description: "Read and publish site content and pages", wave: 3, href: "/api/connections/oauth/framer?label=framer:primary" },
  { id: "invision", label: "InVision", description: "Read prototypes, comments, and assets", wave: 3, href: "/api/connections/oauth/invision?label=invision:primary" },
  { id: "zeplin", label: "Zeplin", description: "Read design specs, assets, and annotations", wave: 3, href: "/api/connections/oauth/zeplin?label=zeplin:primary" },
  { id: "pandadoc", label: "PandaDoc", description: "Send documents and track signature status", wave: 3, href: "/api/connections/oauth/pandadoc?label=pandadoc:primary" },
  { id: "hellosign", label: "Dropbox Sign", description: "Send signature requests and read status", wave: 3, href: "/api/connections/oauth/hellosign?label=hellosign:primary" },
  { id: "surveymonkey", label: "SurveyMonkey", description: "Read survey responses and manage surveys", wave: 3, href: "/api/connections/oauth/surveymonkey?label=surveymonkey:primary" },
  { id: "jotform", label: "Jotform", description: "Read form submissions and manage forms", wave: 3, href: "/api/connections/oauth/jotform?label=jotform:primary" },
  { id: "tally", label: "Tally", description: "Read form responses and manage workspaces", wave: 3, href: "/api/connections/oauth/tally?label=tally:primary" },
  { id: "googleforms", label: "Google Forms", description: "Read form responses and manage forms", wave: 3, href: "/api/connections/oauth/googleforms?label=googleforms:primary" },
  { id: "paperform", label: "Paperform", description: "Read submissions and manage forms", wave: 3, href: "/api/connections/oauth/paperform?label=paperform:primary" },
  { id: "cloudinary", label: "Cloudinary", description: "Upload, transform, and deliver media assets", wave: 3, href: "/api/connections/oauth/cloudinary?label=cloudinary:primary" },
  { id: "awss3", label: "AWS S3", description: "Read and write files to S3 buckets", wave: 3, href: "/api/connections/oauth/awss3?label=awss3:primary" },
  { id: "vimeo", label: "Vimeo", description: "Upload videos and read analytics", wave: 3, href: "/api/connections/oauth/vimeo?label=vimeo:primary" },
  { id: "wistia", label: "Wistia", description: "Manage videos and read engagement stats", wave: 3, href: "/api/connections/oauth/wistia?label=wistia:primary" },
  { id: "mux", label: "Mux", description: "Manage video assets and read playback data", wave: 3, href: "/api/connections/oauth/mux?label=mux:primary" },
  { id: "adyen", label: "Adyen", description: "Read payments, refunds, and disputes", wave: 3, href: "/api/connections/oauth/adyen?label=adyen:primary" },
  { id: "braintree", label: "Braintree", description: "Read transactions, customers, and subscriptions", wave: 3, href: "/api/connections/oauth/braintree?label=braintree:primary" },
  { id: "acuityscheduling", label: "Acuity Scheduling", description: "Read appointments and manage availability", wave: 3, href: "/api/connections/oauth/acuityscheduling?label=acuityscheduling:primary" },
  { id: "doodle", label: "Doodle", description: "Create polls and manage meeting scheduling", wave: 3, href: "/api/connections/oauth/doodle?label=doodle:primary" },
  { id: "simplybook", label: "SimplyBook.me", description: "Manage bookings and client appointments", wave: 3, href: "/api/connections/oauth/simplybook?label=simplybook:primary" },
  { id: "eventbrite", label: "Eventbrite", description: "Manage events, tickets, and attendees", wave: 3, href: "/api/connections/oauth/eventbrite?label=eventbrite:primary" },
  { id: "luma", label: "Luma", description: "Manage events and read guest RSVPs", wave: 3, href: "/api/connections/oauth/luma?label=luma:primary" },
  { id: "ringcentral", label: "RingCentral", description: "Send SMS, manage calls, and read logs", wave: 3, href: "/api/connections/oauth/ringcentral?label=ringcentral:primary" },
  { id: "aircall", label: "Aircall", description: "Read calls, contacts, and team activity", wave: 3, href: "/api/connections/oauth/aircall?label=aircall:primary" },
  { id: "openphone", label: "OpenPhone", description: "Send messages and read call activity", wave: 3, href: "/api/connections/oauth/openphone?label=openphone:primary" },
  { id: "vonage", label: "Vonage", description: "Send SMS, voice, and manage numbers", wave: 3, href: "/api/connections/oauth/vonage?label=vonage:primary" },
  { id: "dialpad", label: "Dialpad", description: "Read calls, transcripts, and contacts", wave: 3, href: "/api/connections/oauth/dialpad?label=dialpad:primary" },
  { id: "telnyx", label: "Telnyx", description: "Send SMS and manage phone numbers", wave: 3, href: "/api/connections/oauth/telnyx?label=telnyx:primary" },
  { id: "openai", label: "OpenAI", description: "Call GPT models and manage assistants", wave: 3, href: "/api/connections/oauth/openai?label=openai:primary" },
  { id: "replicate", label: "Replicate", description: "Run open-source AI models via API", wave: 3, href: "/api/connections/oauth/replicate?label=replicate:primary" },
  { id: "cohere", label: "Cohere", description: "Generate text and embed documents", wave: 3, href: "/api/connections/oauth/cohere?label=cohere:primary" },
  { id: "pinecone", label: "Pinecone", description: "Upsert and query vector embeddings", wave: 3, href: "/api/connections/oauth/pinecone?label=pinecone:primary" },
  { id: "okta", label: "Okta", description: "Manage users, groups, and applications", wave: 3, href: "/api/connections/oauth/okta?label=okta:primary" },
  { id: "auth0", label: "Auth0", description: "Manage users, roles, and authentication logs", wave: 3, href: "/api/connections/oauth/auth0?label=auth0:primary" },
  { id: "jumpcloud", label: "JumpCloud", description: "Manage users, devices, and directory groups", wave: 3, href: "/api/connections/oauth/jumpcloud?label=jumpcloud:primary" },
  { id: "apollo", label: "Apollo.io", description: "Search contacts, enrich leads, and manage sequences", wave: 3, href: "/api/connections/oauth/apollo?label=apollo:primary" },
  { id: "clearbit", label: "Clearbit", description: "Enrich companies and contacts with firmographic data", wave: 3, href: "/api/connections/oauth/clearbit?label=clearbit:primary" },
  { id: "hunter", label: "Hunter.io", description: "Find and verify professional email addresses", wave: 3, href: "/api/connections/oauth/hunter?label=hunter:primary" },
  { id: "zoominfo", label: "ZoomInfo", description: "Search B2B contacts and company intelligence", wave: 3, href: "/api/connections/oauth/zoominfo?label=zoominfo:primary" },
  { id: "lusha", label: "Lusha", description: "Enrich leads with contact and company data", wave: 3, href: "/api/connections/oauth/lusha?label=lusha:primary" },
  { id: "contentful", label: "Contentful", description: "Read and write CMS entries and assets", wave: 3, href: "/api/connections/oauth/contentful?label=contentful:primary" },
  { id: "sanity", label: "Sanity", description: "Read and write structured content documents", wave: 3, href: "/api/connections/oauth/sanity?label=sanity:primary" },
  { id: "ghost", label: "Ghost", description: "Manage posts, members, and newsletters", wave: 3, href: "/api/connections/oauth/ghost?label=ghost:primary" },
  { id: "storyblok", label: "Storyblok", description: "Manage stories, components, and assets", wave: 3, href: "/api/connections/oauth/storyblok?label=storyblok:primary" },
  { id: "prismic", label: "Prismic", description: "Read and publish structured content documents", wave: 3, href: "/api/connections/oauth/prismic?label=prismic:primary" },
  { id: "toggl", label: "Toggl", description: "Read time entries and manage projects", wave: 3, href: "/api/connections/oauth/toggl?label=toggl:primary" },
  { id: "harvest", label: "Harvest", description: "Log time, manage projects, and send invoices", wave: 3, href: "/api/connections/oauth/harvest?label=harvest:primary" },
  { id: "clockify", label: "Clockify", description: "Track time entries and manage workspaces", wave: 3, href: "/api/connections/oauth/clockify?label=clockify:primary" },
  { id: "hubstaff", label: "Hubstaff", description: "Read time tracking, activity, and payroll data", wave: 3, href: "/api/connections/oauth/hubstaff?label=hubstaff:primary" },
  { id: "servicenow", label: "ServiceNow", description: "Manage incidents, requests, and CMDB records", wave: 3, href: "/api/connections/oauth/servicenow?label=servicenow:primary" },
  { id: "opsgenie", label: "OpsGenie", description: "Create alerts and manage on-call schedules", wave: 3, href: "/api/connections/oauth/opsgenie?label=opsgenie:primary" },
  { id: "evernote", label: "Evernote", description: "Create and read notes and notebooks", wave: 3, href: "/api/connections/oauth/evernote?label=evernote:primary" },
  { id: "onenote", label: "OneNote", description: "Create and read pages and notebooks", wave: 3, href: "/api/connections/oauth/onenote?label=onenote:primary" },
  { id: "nuclino", label: "Nuclino", description: "Read and write team wiki pages and workspaces", wave: 3, href: "/api/connections/oauth/nuclino?label=nuclino:primary" },
  { id: "telegram", label: "Telegram", description: "Send messages and manage bot interactions", wave: 3, href: "/api/connections/oauth/telegram?label=telegram:primary" },
  { id: "webex", label: "Cisco Webex", description: "Send messages and manage meetings and rooms", wave: 3, href: "/api/connections/oauth/webex?label=webex:primary" },
  { id: "googlechat", label: "Google Chat", description: "Send messages to spaces and direct messages", wave: 3, href: "/api/connections/oauth/googlechat?label=googlechat:primary" },
  { id: "rocketchat", label: "Rocket.Chat", description: "Send messages and manage channels", wave: 3, href: "/api/connections/oauth/rocketchat?label=rocketchat:primary" },
  { id: "semrush", label: "Semrush", description: "Query keyword rankings and site audit data", wave: 3, href: "/api/connections/oauth/semrush?label=semrush:primary" },
  { id: "ahrefs", label: "Ahrefs", description: "Query backlinks, keywords, and site metrics", wave: 3, href: "/api/connections/oauth/ahrefs?label=ahrefs:primary" },
];

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "overview", label: "Overview", caption: "Status and quick actions", icon: Settings2, group: "Connection" },
  { id: "accounts", label: "Accounts", caption: "Manage connected accounts", icon: Users, group: "Connection" },
  { id: "primary", label: "Primary", caption: "Choose the default account", icon: Star, group: "Connection" },
  { id: "health", label: "Access & health", caption: "Scopes and connection checks", icon: ShieldCheck, group: "Management" },
  { id: "danger", label: "Disconnect", caption: "Remove accounts and revoke access", icon: Trash2, group: "Management" },
];

function ProviderLogo({ provider, size = 26 }: { provider: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = PROVIDER_ICON_URL[provider] ?? null;

  if (!iconUrl || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground"
      >
        {provider.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 glass-card p-0.5"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt={PROVIDER_LABELS[provider] ?? provider}
        width={size - 4}
        height={size - 4}
        style={{ objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function getProvider(providerId: string | null): Provider | null {
  if (!providerId) return null;

  return (
    AVAILABLE_PROVIDERS.find((provider) => provider.id === providerId) ?? {
      id: providerId,
      label: PROVIDER_LABELS[providerId] ?? providerId,
      description: "Manage connected accounts and authentication settings.",
      wave: 3,
      href: `/api/connections/oauth/${providerId}?label=${getPrimaryConnectionName(providerId)}`,
    }
  );
}

function getFirstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return (
    getFirstString(record.email) ??
    getFirstString(record.login) ??
    getFirstString(record.alias) ??
    getFirstString(record.team) ??
    getFirstString(record.workspace) ??
    getFirstString(record.name) ??
    getFirstString(record.hub_domain) ??
    getFirstString(record.user)
  );
}

function getConnectionIdentity(metadata: Record<string, unknown> | null, fallback: string): string {
  return (
    getFirstString(metadata?.email) ??
    getFirstString(metadata?.login) ??
    getFirstString(metadata?.alias) ??
    getFirstString(metadata?.team) ??
    getFirstString(metadata?.workspace) ??
    getFirstString(metadata?.name) ??
    getFirstString(metadata?.hub_domain) ??
    getFirstString(metadata?.user) ??
    fallback
  );
}

function formatDate(value: string | null): string | null {
  if (!value) return null;

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Gmail watches expire after 7 days. Mirror the 24-hour refresh window from
// the server so the badge flips to "Expiring soon" a day before auto-renewal.
const GMAIL_WATCH_REFRESH_AHEAD_MS = 24 * 60 * 60 * 1000;

type GmailWatchStatus = "active" | "expiring" | "missing";

function getGmailWatchStatus(metadata: Record<string, unknown> | null): GmailWatchStatus {
  const watch = metadata?.gmail_watch;
  if (!watch || typeof watch !== "object" || Array.isArray(watch)) return "missing";
  const w = watch as Record<string, unknown>;

  const historyId = w.history_id;
  const hasHistoryId =
    (typeof historyId === "string" && historyId.trim()) ||
    (typeof historyId === "number" && Number.isFinite(historyId));
  if (!hasHistoryId) return "missing";

  const expiration = typeof w.expiration === "string" ? w.expiration : null;
  if (!expiration) return "missing";

  const expiresAt = Date.parse(expiration);
  if (Number.isNaN(expiresAt)) return "missing";

  const now = Date.now();
  if (expiresAt <= now) return "missing";
  if (expiresAt - now <= GMAIL_WATCH_REFRESH_AHEAD_MS) return "expiring";
  return "active";
}

function GmailWatchBadge({ metadata }: { metadata: Record<string, unknown> | null }) {
  const status = getGmailWatchStatus(metadata);
  if (status === "active") {
    return <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400">Inbox watch active</Badge>;
  }
  if (status === "expiring") {
    return <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 dark:text-yellow-400">Inbox watch expiring</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground/60">Inbox watch not set up</Badge>;
}

function sortConnections(left: Connection, right: Connection): number {
  const leftIsPrimary = isPrimaryConnectionName(left.provider, left.name);
  const rightIsPrimary = isPrimaryConnectionName(right.provider, right.name);

  if (leftIsPrimary !== rightIsPrimary) {
    return leftIsPrimary ? -1 : 1;
  }

  const providerCompare = (PROVIDER_LABELS[left.provider] ?? left.provider).localeCompare(
    PROVIDER_LABELS[right.provider] ?? right.provider,
  );
  if (providerCompare !== 0) return providerCompare;

  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("overview");
  const [highlightedConnectionId, setHighlightedConnectionId] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");

  // API key dialog state (for providers that use API keys instead of OAuth2)
  const [apiKeyProvider, setApiKeyProvider] = useState<string | null>(null);
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  // Multi-field credentials for the IMAP/SMTP (Thunderbird) connection.
  const emptyImap = { imap_host: "", imap_port: "", smtp_host: "", smtp_port: "", username: "", password: "", security: "ssl" };
  const [imapFields, setImapFields] = useState(emptyImap);
  const isImapProvider = apiKeyProvider === "thunderbird";

  const router = useRouter();
  const searchParams = useSearchParams();

  const successProvider = searchParams.get("connected");
  const errorCode = searchParams.get("error");

  const load = useCallback(async () => {
    setLoading(true);

    const response = await fetch("/api/connections");
    if (response.ok) {
      const data = (await response.json()) as Connection[];
      setConnections(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Open API key dialog when redirected back from the catch-all OAuth route
  useEffect(() => {
    const provider = searchParams.get("connect_api_key");
    if (!provider) return;
    const label = searchParams.get("label") ?? `${provider}:primary`;
    setApiKeyProvider(provider);
    setApiKeyLabel(label);
    setApiKeyValue("");
    setApiKeyError(null);
    // Clear the query params from the URL without a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("connect_api_key");
    url.searchParams.delete("label");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  }, [searchParams, router]);

  async function handleApiKeySubmit() {
    if (!apiKeyProvider) return;
    // IMAP/SMTP stores a JSON credential blob (via the same api_key vault path).
    let credential: string;
    if (isImapProvider) {
      const f = imapFields;
      if (!f.imap_host.trim() || !f.username.trim() || !f.password) {
        setApiKeyError("IMAP host, username, and password are required.");
        return;
      }
      credential = JSON.stringify({
        imap_host: f.imap_host.trim(),
        imap_port: f.imap_port ? Number(f.imap_port) : undefined,
        smtp_host: (f.smtp_host.trim() || f.imap_host.trim()),
        smtp_port: f.smtp_port ? Number(f.smtp_port) : undefined,
        username: f.username.trim(),
        password: f.password,
        security: f.security,
      });
    } else {
      if (!apiKeyValue.trim()) return;
      credential = apiKeyValue.trim();
    }
    setApiKeySubmitting(true);
    setApiKeyError(null);
    try {
      const res = await fetch("/api/connections/store-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiKeyProvider,
          label: apiKeyLabel,
          api_key: credential,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setApiKeyError(friendlyResponseMessage(data, "We could not save this connection. Please try again."));
        return;
      }
      setApiKeyProvider(null);
      setApiKeyValue("");
      setImapFields(emptyImap);
      await load();
    } catch {
      setApiKeyError("We could not connect. Check your internet connection and try again.");
    } finally {
      setApiKeySubmitting(false);
    }
  }

  const sortedConnections = useMemo(
    () => [...connections].sort(sortConnections),
    [connections],
  );

  const connectedProviders = useMemo(
    () => new Set(connections.map((connection) => connection.provider)),
    [connections],
  );

  const normalizedProviderSearch = providerSearch.trim().toLowerCase();
  const hasProviderSearch = normalizedProviderSearch.length > 0;
  const filteredAvailableProviders = useMemo(() => {
    if (!hasProviderSearch) return [];

    return AVAILABLE_PROVIDERS.filter((provider) => {
      if (connectedProviders.has(provider.id)) return false;

      const label = provider.label.toLowerCase();
      const description = provider.description.toLowerCase();
      const id = provider.id.toLowerCase();

      return (
        label.includes(normalizedProviderSearch) ||
        description.includes(normalizedProviderSearch) ||
        id.includes(normalizedProviderSearch)
      );
    });
  }, [hasProviderSearch, normalizedProviderSearch, connectedProviders]);

  const activeProvider = getProvider(activeProviderId);
  const activeProviderConnections = useMemo(
    () => sortedConnections.filter((connection) => connection.provider === activeProviderId),
    [activeProviderId, sortedConnections],
  );
  const activePrimaryConnection =
    activeProviderConnections.find((connection) =>
      isPrimaryConnectionName(connection.provider, connection.name),
    ) ?? null;
  const healthyConnectionCount = activeProviderConnections.filter((connection) => connection.is_valid).length;
  const attentionConnectionCount = activeProviderConnections.length - healthyConnectionCount;
  const latestValidatedAt = activeProviderConnections.reduce<string | null>((latest, connection) => {
    if (!connection.last_validated_at) return latest;
    if (!latest) return connection.last_validated_at;
    return new Date(connection.last_validated_at).getTime() > new Date(latest).getTime()
      ? connection.last_validated_at
      : latest;
  }, null);
  const activeSectionMeta =
    SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ?? SETTINGS_NAV_ITEMS[0];

  useEffect(() => {
    if (!activeProviderId) return;
    setActiveSection("overview");
  }, [activeProviderId]);

  function openProvider(providerId: string, connectionId?: string) {
    setActiveProviderId(providerId);
    setHighlightedConnectionId(connectionId ?? null);
  }

  function closeProviderDialog() {
    setActiveProviderId(null);
    setHighlightedConnectionId(null);
  }

  async function handleTest(connectionId: string) {
    setTesting(connectionId);
    await fetch(`/api/connections/${connectionId}`, { method: "POST" });
    await load();
    setTesting(null);
  }

  async function handleDelete(connectionId: string) {
    setDeleting(connectionId);
    await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
    setConnections((previous) => previous.filter((connection) => connection.id !== connectionId));

    if (highlightedConnectionId === connectionId) {
      setHighlightedConnectionId(null);
    }

    setDeleting(null);
  }

  async function handleSetPrimary(connectionId: string) {
    setPromoting(connectionId);

    const response = await fetch(`/api/connections/${connectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_primary" }),
    });

    if (response.ok) {
      await load();
      setHighlightedConnectionId(connectionId);
    }

    setPromoting(null);
  }

  function handleConnect(provider: Provider, mode: "primary" | "secondary") {
    setConnecting(provider.id);

    const url = new URL(provider.href, window.location.origin);
    if (mode === "secondary") {
      const providerNames = connections
        .filter((connection) => connection.provider === provider.id)
        .map((connection) => connection.name);

      url.searchParams.set(
        "label",
        getNextSecondaryConnectionName(provider.id, providerNames),
      );
    } else {
      url.searchParams.set("label", getPrimaryConnectionName(provider.id));
    }

    window.location.href = `${url.pathname}${url.search}`;
  }

  function renderProviderEmptyState(
    title: string,
    description: string,
    actionLabel?: string,
  ) {
    if (!activeProvider) return null;

    return (
      <div className="rounded-2xl border border-dashed glass-card px-5 py-8 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel && (
          <Button
            className="mt-4"
            disabled={connecting === activeProvider.id}
            onClick={() => handleConnect(activeProvider, "primary")}
          >
            {connecting === activeProvider.id ? "Connecting..." : actionLabel}
          </Button>
        )}
      </div>
    );
  }

  function renderAccountsSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No accounts connected yet",
        `Connect your first ${activeProvider.label} account to start using it in programs.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Connected accounts</h3>
            <p className="text-sm text-muted-foreground">
              Manage every linked {activeProvider.label} account from one place.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={connecting === activeProvider.id}
            onClick={() => handleConnect(activeProvider, "secondary")}
          >
            {connecting === activeProvider.id ? "Redirecting..." : "Add another account"}
          </Button>
        </div>

        {activeProviderConnections.map((connection) => {
          const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
          const identity = getConnectionIdentity(connection.metadata, connection.name);
          const lastTested = formatDate(connection.last_validated_at);
          const highlight = highlightedConnectionId === connection.id;

          return (
            <div
              key={connection.id}
              className={cn(
                "rounded-2xl border px-4 py-4 transition-colors",
                highlight ? "border-primary/50 bg-primary/5" : "border-border/70 glass-card",
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{identity}</p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                    <Badge variant={connection.is_valid ? "success" : "destructive"}>
                      {connection.is_valid ? "Connected" : "Needs attention"}
                    </Badge>
                    {connection.provider === "gmail" && (
                      <GmailWatchBadge metadata={connection.metadata} />
                    )}
                  </div>
                  <p className="break-all text-xs font-mono text-muted-foreground/70">
                    {connection.name}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {lastTested ? `Last tested ${lastTested}` : "Not tested yet"}
                    {Array.isArray(connection.scopes) && connection.scopes.length > 0
                      ? ` - ${connection.scopes.length} scope${connection.scopes.length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {!isPrimary && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={promoting === connection.id}
                      onClick={() => handleSetPrimary(connection.id)}
                    >
                      {promoting === connection.id ? "Saving..." : "Set primary"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={testing === connection.id}
                    onClick={() => handleTest(connection.id)}
                  >
                    {testing === connection.id ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground/70 hover:text-destructive"
                    disabled={deleting === connection.id}
                    onClick={() => handleDelete(connection.id)}
                  >
                    {deleting === connection.id ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderOverviewSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "This connector is ready to set up",
        `Add a ${activeProvider.label} account, then pick which one should be used as the default for new program runs.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Accounts
            </p>
            <p className="mt-2 text-lg font-semibold">{activeProviderConnections.length}</p>
          </div>
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Primary
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {activePrimaryConnection
                ? getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)
                : "Not selected"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Health
            </p>
            <p className="mt-2 text-sm font-medium">
              {attentionConnectionCount > 0 ? `${attentionConnectionCount} need review` : "All connected accounts look healthy"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 glass-panel px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Quick actions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Jump straight to the area you need without hunting through the popup.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setActiveSection("accounts")}>
                Manage accounts
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveSection("primary")}>
                Choose primary
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveSection("health")}>
                Check health
              </Button>
            </div>
          </div>
        </div>

        {activePrimaryConnection && (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Current primary account</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Programs using the default {activeProvider.label} connection will follow this account.
                </p>
              </div>
              <Badge variant={activePrimaryConnection.is_valid ? "success" : "destructive"}>
                {activePrimaryConnection.is_valid ? "Ready" : "Needs attention"}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-medium">
              {getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)}
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground/70">
              {activePrimaryConnection.name}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Connected accounts</p>
            <Button
              size="sm"
              variant="outline"
              disabled={connecting === activeProvider.id}
              onClick={() => handleConnect(activeProvider, "secondary")}
            >
              {connecting === activeProvider.id ? "Redirecting..." : "Add another account"}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {activeProviderConnections.map((connection) => {
              const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
              return (
                <div key={connection.id} className="rounded-xl border border-border/70 glass-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {getConnectionIdentity(connection.metadata, connection.name)}
                    </p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground/70">
                    {connection.name}
                  </p>
                  {connection.provider === "gmail" && (
                    <div className="mt-2">
                      <GmailWatchBadge metadata={connection.metadata} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderPrimarySection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No primary account yet",
        `Connect a ${activeProvider.label} account first, then you can choose which one should be primary.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 glass-panel px-5 py-4">
          <p className="text-sm font-semibold">How primary works</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The primary account becomes the default {activeProvider.label} connection used anywhere the app refers to <span className="font-mono">{getPrimaryConnectionName(activeProvider.id)}</span>.
          </p>
        </div>

        {activePrimaryConnection && (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
            <p className="text-sm font-semibold">Current primary</p>
            <p className="mt-2 text-sm font-medium">
              {getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)}
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground/70">
              {activePrimaryConnection.name}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold">Available accounts</p>
          {activeProviderConnections.map((connection) => {
            const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);

            return (
              <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 glass-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {getConnectionIdentity(connection.metadata, connection.name)}
                    </p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="mt-1 break-all text-xs font-mono text-muted-foreground/70">
                    {connection.name}
                  </p>
                </div>
                {!isPrimary ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={promoting === connection.id}
                    onClick={() => handleSetPrimary(connection.id)}
                  >
                    {promoting === connection.id ? "Saving..." : "Make primary"}
                  </Button>
                ) : (
                  <Badge variant="success">Default account</Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderHealthSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "Nothing to check yet",
        `Once you connect ${activeProvider.label}, you can review scopes and run live connection tests here.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Healthy
            </p>
            <p className="mt-2 text-lg font-semibold">{healthyConnectionCount}</p>
          </div>
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Needs attention
            </p>
            <p className="mt-2 text-lg font-semibold">{attentionConnectionCount}</p>
          </div>
          <div className="rounded-xl border border-border/70 glass-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Last check
            </p>
            <p className="mt-2 text-sm font-medium">
              {latestValidatedAt ? formatDate(latestValidatedAt) : "Not tested yet"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {activeProviderConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 glass-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {getConnectionIdentity(connection.metadata, connection.name)}
                  </p>
                  <Badge variant={connection.is_valid ? "success" : "destructive"}>
                    {connection.is_valid ? "Connected" : "Needs attention"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {connection.last_validated_at
                    ? `Tested ${formatDate(connection.last_validated_at)}`
                    : "Not tested yet"}
                  {Array.isArray(connection.scopes) && connection.scopes.length > 0
                    ? ` - ${connection.scopes.join(", ")}`
                    : " - scopes unavailable"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={testing === connection.id}
                onClick={() => handleTest(connection.id)}
              >
                {testing === connection.id ? "Testing..." : "Run test"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderDangerSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No connected accounts to remove",
        `Disconnecting options for ${activeProvider.label} will appear here once an account has been added.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <p className="text-sm font-semibold text-destructive">Disconnect with care</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Removing an account revokes it from future runs and may affect programs that still depend on it.
          </p>
        </div>

        <div className="space-y-3">
          {activeProviderConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 glass-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {getConnectionIdentity(connection.metadata, connection.name)}
                </p>
                <p className="mt-1 break-all text-xs font-mono text-muted-foreground/70">
                  {connection.name}
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting === connection.id}
                onClick={() => handleDelete(connection.id)}
              >
                {deleting === connection.id ? "Disconnecting..." : "Disconnect account"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Connections</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Click any connection to open its settings, review linked accounts, and manage which account is primary.
        </p>
      </div>

      {successProvider && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-400">
          Connected {PROVIDER_LABELS[successProvider] ?? successProvider}.
        </div>
      )}

      {errorCode && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          OAuth failed: {errorCode}. Please try again.
        </div>
      )}

      {!loading && sortedConnections.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Connected - {sortedConnections.length}
          </h2>
          <div className="overflow-hidden rounded-xl border glass-card">
            {sortedConnections.map((connection, index) => {
              const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
              const identity = getConnectionIdentity(connection.metadata, connection.name);
              const hasRealIdentity = identity !== connection.name;
              const testedLabel = formatDate(connection.last_validated_at);
              const providerLabel = PROVIDER_LABELS[connection.provider] ?? connection.provider;

              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => openProvider(connection.provider, connection.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/30",
                    index > 0 && "border-t border-border/60",
                  )}
                >
                  <ProviderLogo provider={connection.provider} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{providerLabel}</p>
                      {hasRealIdentity && (
                        <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {identity}
                        </span>
                      )}
                      <Badge variant={connection.is_valid ? "success" : "destructive"}>
                        {connection.is_valid ? "Connected" : "Needs attention"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                      {testedLabel ? `Tested ${testedLabel}` : "Not tested yet"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground/60">
                    Manage
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {(() => {
        const popularProviders = POPULAR_PROVIDER_IDS
          .map((id) => AVAILABLE_PROVIDERS.find((p) => p.id === id))
          .filter((p): p is Provider => !!p && !connectedProviders.has(p.id));
        if (popularProviders.length === 0) return null;
        return (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Popular
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {popularProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => openProvider(provider.id)}
                  className="group flex items-center gap-3 rounded-xl border glass-card px-4 py-3.5 text-left transition-all hover:border-border/80 hover:bg-accent/30"
                >
                  <ProviderLogo provider={provider.id} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{provider.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground/60">{provider.description}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground/60">Connect</span>
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-end">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Search connectors
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasProviderSearch
                ? `Showing ${filteredAvailableProviders.length} result${filteredAvailableProviders.length === 1 ? "" : "s"}.`
                : "Type a connector name or feature to find an integration."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                type="search"
                value={providerSearch}
                onChange={(event) => setProviderSearch(event.target.value)}
                placeholder="Search connectors..."
                className="pl-9"
              />
            </div>
            {hasProviderSearch && (
              <Button size="sm" variant="outline" onClick={() => setProviderSearch("")}>Clear</Button>
            )}
          </div>
        </div>

        {filteredAvailableProviders ? (
          <div className="space-y-2">
            {filteredAvailableProviders.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredAvailableProviders.map((provider) => {
                  const isPro = PAY_PER_USE_PROVIDERS.has(provider.id);
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => openProvider(provider.id)}
                      className="group flex items-center gap-3 rounded-xl border glass-card px-4 py-3.5 text-left transition-all hover:border-border/80 hover:bg-accent/30"
                    >
                      <ProviderLogo provider={provider.id} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{provider.label}</p>
                          {isPro && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                              <Lock className="h-2.5 w-2.5" />
                              Solo
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground/60">
                          {provider.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground/60">
                        View
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-white/[0.02] backdrop-blur-md px-5 py-10 text-center">
                <Search className="mx-auto h-5 w-5 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {hasProviderSearch ? "No connectors match your search" : "Search to add a connector"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasProviderSearch
                    ? "Try a different app name or feature."
                    : "Available connectors stay hidden until you search by app name or capability."}
                </p>
              </div>
            )}
          </div>
        ) : (
          (() => {
            const wave1 = AVAILABLE_PROVIDERS.filter(
              (p) => p.wave === 1 && !connectedProviders.has(p.id),
            );
            const moreFree = AVAILABLE_PROVIDERS.filter(
              (p) => (p.wave === 2 || p.wave === 3) && !connectedProviders.has(p.id) && !PAY_PER_USE_PROVIDERS.has(p.id),
            );
            const morePro = AVAILABLE_PROVIDERS.filter(
              (p) => (p.wave === 2 || p.wave === 3) && !connectedProviders.has(p.id) && PAY_PER_USE_PROVIDERS.has(p.id),
            );

            const sections: Array<{ label: string; description: string; providers: Provider[]; isPro?: boolean }> = [];
            if (wave1.length > 0) {
              sections.push({
                label: sortedConnections.length > 0 ? "Add more" : "Available",
                description: "Connect your own account via OAuth — always included.",
                providers: wave1,
              });
            }
            if (moreFree.length > 0) {
              sections.push({
                label: "Free plan",
                description: "Included for all users — connect via OAuth or a shared platform key.",
                providers: moreFree,
              });
            }
            if (morePro.length > 0) {
              sections.push({
                label: "Solo plan",
                description: "Billed per usage to your own account — requires Solo plan or higher. Connect with your own API key.",
                providers: morePro,
                isPro: true,
              });
            }

            return sections.map(({ label, description, providers, isPro }) => (
              <section key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  {isPro && <Lock className="h-3 w-3 text-amber-500" />}
                  <h2 className={cn(
                    "text-[11px] font-bold uppercase tracking-widest",
                    isPro ? "text-amber-500/70" : "text-muted-foreground/50",
                  )}>
                    {label}
                  </h2>
                </div>
                <p className="text-[11px] text-muted-foreground/50">{description}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => openProvider(provider.id)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border glass-card px-4 py-3.5 text-left transition-all",
                        isPro
                          ? "border-amber-500/15 hover:border-amber-500/30 hover:bg-amber-500/5"
                          : "border-border hover:border-border/80 hover:bg-accent/30",
                      )}
                    >
                      <ProviderLogo provider={provider.id} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{provider.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground/60">
                          {provider.description}
                        </p>
                      </div>
                      {isPro ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                          <Lock className="h-2.5 w-2.5" />
                          Solo
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground/60">
                          View
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ));
          })()
        )}
      </section>

      {/* API Key connection dialog — shown for providers that don't use OAuth2 redirect flows */}
      <Dialog
        open={!!apiKeyProvider}
        onOpenChange={(open) => {
          if (!open) {
            setApiKeyProvider(null);
            setApiKeyValue("");
            setApiKeyError(null);
            setImapFields(emptyImap);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Connect {apiKeyProvider ? (PROVIDER_LABELS[apiKeyProvider] ?? apiKeyProvider) : ""}
            </DialogTitle>
            <DialogDescription>
              {isImapProvider
                ? "Enter your mailbox's IMAP/SMTP server details — encrypted and stored securely, never exposed to the frontend. For Gmail/Outlook, use an app-password (their IMAP requires one)."
                : "Enter your API key or access token. It will be encrypted and stored securely — never exposed to the frontend."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {isImapProvider ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="imap-user">Email address</Label>
                  <Input id="imap-user" autoFocus placeholder="you@example.com" value={imapFields.username}
                    onChange={(e) => setImapFields((s) => ({ ...s, username: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="imap-pass">Password / app-password</Label>
                  <Input id="imap-pass" type="password" placeholder="••••••••" value={imapFields.password}
                    onChange={(e) => setImapFields((s) => ({ ...s, password: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-host">IMAP host</Label>
                  <Input id="imap-host" placeholder="imap.example.com" value={imapFields.imap_host}
                    onChange={(e) => setImapFields((s) => ({ ...s, imap_host: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-port">IMAP port</Label>
                  <Input id="imap-port" type="number" placeholder="993" value={imapFields.imap_port}
                    onChange={(e) => setImapFields((s) => ({ ...s, imap_port: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input id="smtp-host" placeholder="same as IMAP" value={imapFields.smtp_host}
                    onChange={(e) => setImapFields((s) => ({ ...s, smtp_host: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">SMTP port</Label>
                  <Input id="smtp-port" type="number" placeholder="465" value={imapFields.smtp_port}
                    onChange={(e) => setImapFields((s) => ({ ...s, smtp_port: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="imap-sec">Security</Label>
                  <select id="imap-sec" value={imapFields.security}
                    onChange={(e) => setImapFields((s) => ({ ...s, security: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="ssl">SSL/TLS (ports 993 / 465)</option>
                    <option value="starttls">STARTTLS (ports 143 / 587)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="api-key-input">API key / access token</Label>
                <Input
                  id="api-key-input"
                  ref={apiKeyInputRef}
                  type="password"
                  placeholder="sk-... or paste your token here"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !apiKeySubmitting) void handleApiKeySubmit();
                  }}
                  autoFocus
                />
              </div>
            )}
            {apiKeyError && (
              <p className="text-sm text-destructive">{apiKeyError}</p>
            )}
            {!isImapProvider && (
              <p className="text-[11px] text-muted-foreground/60">
                You can find your API key in your {apiKeyProvider ? (PROVIDER_LABELS[apiKeyProvider] ?? apiKeyProvider) : "provider"} account settings or developer dashboard.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApiKeyProvider(null);
                setApiKeyValue("");
                setApiKeyError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                apiKeySubmitting ||
                (isImapProvider
                  ? !imapFields.imap_host.trim() || !imapFields.username.trim() || !imapFields.password
                  : !apiKeyValue.trim())
              }
              onClick={() => void handleApiKeySubmit()}
            >
              {apiKeySubmitting ? "Saving..." : "Save connection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeProvider} onOpenChange={(open) => { if (!open) closeProviderDialog(); }}>
        <DialogContent className="h-[78vh] max-h-[78vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
          {activeProvider && (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="flex h-full min-h-0 flex-col border-b border-border/60 bg-muted/25 lg:border-b-0 lg:border-r">
                <div className="flex-1 overflow-y-auto px-4 py-5">
                  <div className="rounded-2xl border border-border/70 glass-panel px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo provider={activeProvider.id} size={38} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">{activeProvider.label}</p>
                          {PAY_PER_USE_PROVIDERS.has(activeProvider.id) && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                              <Lock className="h-2.5 w-2.5" />
                              Solo
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {activeProviderConnections.length === 0
                            ? "Not connected yet"
                            : `${activeProviderConnections.length} account${activeProviderConnections.length === 1 ? "" : "s"} linked`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(["Connection", "Management"] as const).map((group) => {
                    const items = SETTINGS_NAV_ITEMS.filter((item) => item.group === group);
                    if (items.length === 0) return null;

                    return (
                      <div key={group} className="mt-5 first:mt-6">
                        <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
                          {group}
                        </p>
                        <div className="space-y-1">
                          {items.map((item) => {
                            const Icon = item.icon;
                            const active = item.id === activeSection;

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveSection(item.id)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                                  active
                                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{item.label}</p>
                                  <p className="truncate text-xs text-muted-foreground/75">
                                    {item.caption}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="shrink-0 border-t border-border/60 px-4 pb-5 pt-4">
                  <Button
                    className="w-full"
                    variant={activeProviderConnections.length > 0 ? "outline" : "default"}
                    disabled={connecting === activeProvider.id}
                    onClick={() => handleConnect(activeProvider, activeProviderConnections.length > 0 ? "secondary" : "primary")}
                  >
                    <PlusCircle className="h-4 w-4" />
                    {connecting === activeProvider.id
                      ? "Redirecting..."
                      : activeProviderConnections.length > 0
                        ? "Add account"
                        : `Connect ${activeProvider.label}`}
                  </Button>
                </div>
              </aside>

              <div className="flex min-h-0 min-w-0 flex-col">
                <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <DialogTitle>{activeSectionMeta.label}</DialogTitle>
                      <DialogDescription className="mt-1 max-w-2xl">
                        {activeProvider.label} settings. {activeSectionMeta.caption}.
                      </DialogDescription>
                    </div>
                    <Badge variant="outline">
                      {activeProviderConnections.length === 0
                        ? "Not connected"
                        : `${activeProviderConnections.length} account${activeProviderConnections.length === 1 ? "" : "s"}`}
                    </Badge>
                  </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {activeSection === "overview" && renderOverviewSection()}
                  {activeSection === "accounts" && renderAccountsSection()}
                  {activeSection === "primary" && renderPrimarySection()}
                  {activeSection === "health" && renderHealthSection()}
                  {activeSection === "danger" && renderDangerSection()}
                </div>

                <DialogFooter className="border-t border-border/60 px-6 py-4">
                  <Button variant="outline" onClick={closeProviderDialog}>
                    Close
                  </Button>
                  {activeProviderConnections.length > 0 && activeSection !== "accounts" && (
                    <Button variant="outline" onClick={() => setActiveSection("accounts")}>
                      Manage accounts
                    </Button>
                  )}
                </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

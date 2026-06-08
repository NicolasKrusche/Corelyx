import type {
  AgentNode,
  ConnectionNode,
  Node,
  ProgramSchema,
  StepNode,
  TriggerNode,
} from "@flowos/schema";

export type NodeSummary = {
  total: number;
  connections_needed: string[];
  has_ai: boolean;
};

export type BrowseProgram = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  public_author_name: string | null;
  author_username: string | null;
  schema_version: number;
  node_summary: NodeSummary;
  schema?: ProgramSchema;
};

type Provider =
  | "airtable"
  | "asana"
  | "calendar"
  | "docs"
  | "drive"
  | "github"
  | "gmail"
  | "hubspot"
  | "notion"
  | "outlook"
  | "sheets"
  | "slack"
  | "typeform";

type ScopeAccess = "read" | "write" | "read_write";

const NOW = "2026-04-28T00:00:00.000Z";
const AUTHOR = "Corelyx";
const SENTINEL = "__USER_ASSIGNED__";

const PREMADE_USE_COUNTS: Record<string, number> = {
  "premade-daily-gmail-to-notion": 1842,
  "premade-asana-standup-to-slack": 1327,
  "premade-github-pr-digest-to-slack": 2104,
  "premade-typeform-leads-to-hubspot": 975,
  "premade-hubspot-contacts-to-sheets": 846,
  "premade-airtable-overdue-to-asana": 612,
  "premade-calendar-brief-to-slack": 1568,
  "premade-notion-tasks-to-gmail": 1193,
  "premade-outlook-vip-to-asana": 734,
  "premade-sheets-rows-to-hubspot-deals": 689,
  "premade-webhook-bug-to-github-notion": 531,
  "premade-drive-contract-watch": 418,
  "premade-weekly-docs-report-from-sheets": 902,
  "premade-hubspot-stale-deals-reminder": 771,
  "premade-typeform-nps-detractors": 654,
  "premade-notion-content-to-calendar": 587,
  "premade-gmail-support-to-github": 1436,
  "premade-slack-channel-to-notion-digest": 1248,
  "premade-airtable-low-stock-alert": 463,
  "premade-calendar-followups-to-gmail": 829,
};

const PROVIDER_SCOPES: Record<Provider, Record<ScopeAccess, string[]>> = {
  airtable: {
    read: ["data.records:read"],
    write: ["data.records:write"],
    read_write: ["data.records:read", "data.records:write"],
  },
  asana: {
    read: ["default"],
    write: ["default"],
    read_write: ["default"],
  },
  calendar: {
    read: ["https://www.googleapis.com/auth/calendar.readonly"],
    write: ["https://www.googleapis.com/auth/calendar.events"],
    read_write: ["https://www.googleapis.com/auth/calendar"],
  },
  docs: {
    read: ["https://www.googleapis.com/auth/documents.readonly"],
    write: ["https://www.googleapis.com/auth/documents"],
    read_write: ["https://www.googleapis.com/auth/documents"],
  },
  drive: {
    read: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
    write: ["https://www.googleapis.com/auth/drive"],
    read_write: ["https://www.googleapis.com/auth/drive"],
  },
  github: {
    read: ["repo"],
    write: ["repo"],
    read_write: ["repo"],
  },
  gmail: {
    read: ["https://www.googleapis.com/auth/gmail.readonly"],
    write: ["https://www.googleapis.com/auth/gmail.send"],
    read_write: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  },
  hubspot: {
    read: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    write: ["crm.objects.contacts.write", "crm.objects.deals.write"],
    read_write: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
    ],
  },
  notion: {
    read: [],
    write: [],
    read_write: [],
  },
  outlook: {
    read: ["Mail.Read"],
    write: ["Mail.Send"],
    read_write: ["Mail.Read", "Mail.Send"],
  },
  sheets: {
    read: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    write: ["https://www.googleapis.com/auth/spreadsheets"],
    read_write: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  slack: {
    read: ["channels:read", "channels:history"],
    write: ["chat:write"],
    read_write: ["channels:read", "channels:history", "chat:write"],
  },
  typeform: {
    read: ["forms:read", "responses:read"],
    write: ["forms:read", "responses:read"],
    read_write: ["forms:read", "responses:read"],
  },
};

function position(index: number) {
  return { x: 100 + index * 320, y: 200 };
}

function retry() {
  return {
    max_attempts: 3,
    backoff: "exponential" as const,
    backoff_base_seconds: 5,
    fail_program_on_exhaust: false,
  };
}

function cronTrigger(index: number, id: string, label: string, description: string, expression: string): TriggerNode {
  return {
    id,
    type: "trigger",
    label,
    description,
    connection: null,
    config: { trigger_type: "cron", expression, timezone: "UTC" },
    position: position(index),
    status: "idle",
  };
}

function manualTrigger(index: number, id: string, label = "Manual trigger"): TriggerNode {
  return {
    id,
    type: "trigger",
    label,
    description: "Run this program on demand.",
    connection: null,
    config: { trigger_type: "manual" },
    position: position(index),
    status: "idle",
  };
}

function webhookTrigger(index: number, id: string, label: string, endpointId: string): TriggerNode {
  return {
    id,
    type: "trigger",
    label,
    description: "Receives an inbound webhook payload.",
    connection: null,
    config: { trigger_type: "webhook", endpoint_id: endpointId, method: "POST" },
    position: position(index),
    status: "idle",
  };
}

function eventTrigger(index: number, id: string, source: Provider, event: string): TriggerNode {
  return {
    id,
    type: "trigger",
    label: `${source} event`,
    description: `Starts when ${source} emits ${event}.`,
    connection: null,
    config: { trigger_type: "event", source, event, filter: null },
    position: position(index),
    status: "idle",
  };
}

function connectionNode(
  index: number,
  id: string,
  provider: Provider,
  label: string,
  description: string,
  operation: string,
  operationParams: Record<string, unknown>,
  scopeAccess: ScopeAccess = "read_write"
): ConnectionNode {
  return {
    id,
    type: "connection",
    label,
    description,
    connection: `${provider}:primary`,
    config: {
      connector_type: "oauth",
      provider,
      scope_access: scopeAccess,
      scope_required: PROVIDER_SCOPES[provider][scopeAccess],
      operation,
      operation_params: operationParams,
    },
    position: position(index),
    status: "idle",
  };
}

function stepNode(
  index: number,
  id: string,
  label: string,
  description: string,
  config: StepNode["config"]
): StepNode {
  return {
    id,
    type: "step",
    label,
    description,
    connection: null,
    config,
    position: position(index),
    status: "idle",
  };
}

function agentNode(index: number, id: string, label: string, description: string, systemPrompt: string): AgentNode {
  return {
    id,
    type: "agent",
    label,
    description,
    connection: null,
    config: {
      model: SENTINEL,
      api_key_ref: SENTINEL,
      system_prompt: systemPrompt,
      input_schema: null,
      output_schema: null,
      requires_approval: false,
      approval_timeout_hours: 24,
      scope_required: null,
      scope_access: "read",
      retry: retry(),
      tools: [],
    },
    position: position(index),
    status: "idle",
  };
}

function edgesFor(nodes: Node[]) {
  return nodes.slice(1).map((node, index) => ({
    id: `e${index + 1}`,
    from: nodes[index].id,
    to: node.id,
    type: "data_flow" as const,
    data_mapping: null,
    condition: null,
    label: null,
  }));
}

function triggerRecord(node: TriggerNode) {
  return {
    node_id: node.id,
    type: node.config.trigger_type,
    is_active: true,
    last_fired: null,
    next_scheduled: null,
  };
}

function makeProgram(input: {
  id: string;
  name: string;
  description: string;
  tags: string[];
  nodes: [TriggerNode, ...Node[]];
}): BrowseProgram {
  const schema: ProgramSchema = {
    version: "1.0",
    program_id: input.id,
    program_name: input.name,
    created_at: NOW,
    updated_at: NOW,
    execution_mode: "autonomous",
    nodes: input.nodes,
    edges: edgesFor(input.nodes),
    triggers: [triggerRecord(input.nodes[0])],
    version_history: [],
    metadata: {
      description: input.description,
      genesis_model: "premade-browse-catalog",
      genesis_timestamp: NOW,
      tags: input.tags,
      is_active: false,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    tags: input.tags,
    fork_count: getBrowseUseCount({ id: input.id, name: input.name }),
    published_at: NOW,
    public_author_name: AUTHOR,
    author_username: null,
    schema_version: 1,
    node_summary: deriveNodeSummary(schema),
    schema,
  };
}

export function getBrowseUseCount(input: {
  id: string;
  name: string;
  fork_count?: number | null;
}): number {
  const recordedCount = input.fork_count ?? 0;
  const premadeCount = PREMADE_USE_COUNTS[input.id];
  const displayBaseline = premadeCount ?? 250 + (stableHash(`${input.id}:${input.name}`) % 1850);

  return Math.max(recordedCount, displayBaseline);
}

function stableHash(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

export function deriveNodeSummary(schema: unknown): NodeSummary {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { total: 0, connections_needed: [], has_ai: false };
  }

  const s = schema as Record<string, unknown>;
  const nodes = Array.isArray(s.nodes) ? (s.nodes as Record<string, unknown>[]) : [];
  const connections = new Set<string>();
  let hasAi = false;

  for (const node of nodes) {
    if (node.type === "agent") hasAi = true;
    if (node.type !== "connection") continue;

    const config = node.config as Record<string, unknown> | undefined;
    if (config?.connector_type === "http") {
      connections.add("http");
    } else if (typeof config?.provider === "string") {
      connections.add(config.provider);
    } else if (typeof node.connection === "string") {
      connections.add(node.connection.split(":")[0].toLowerCase());
    }
  }

  return { total: nodes.length, connections_needed: [...connections], has_ai: hasAi };
}

export const PREMADE_BROWSE_PROGRAMS: BrowseProgram[] = [
  makeProgram({
    id: "premade-daily-gmail-to-notion",
    name: "Daily Gmail to Notion",
    description: "Every morning, log matching Gmail messages into a Notion database and mark them as handled.",
    tags: ["gmail", "notion", "daily"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily at 9am", "Runs every day at 9am UTC.", "0 9 * * *"),
      connectionNode(1, "gmail-search", "gmail", "Find new emails", "Searches Gmail for messages not yet logged.", "search", {
        query: '-label:"Logged to Notion" newer_than:1d',
        max_results: 20,
      }, "read"),
      stepNode(2, "loop-emails", "Loop through emails", "Processes each matching email.", {
        logic_type: "loop",
        over: "data['emails']",
        item_var: "email",
      }),
      connectionNode(3, "gmail-read", "gmail", "Read email", "Loads the full message body.", "read_email", {
        message_id: "{{loop-emails.email.id}}",
      }, "read"),
      agentNode(4, "summarize-email", "Summarize email", "Extracts the useful details for Notion.", "Summarize the email as a short task note with sender, subject, summary, and recommended next action."),
      connectionNode(5, "notion-create", "notion", "Create Notion item", "Creates a row in the selected Notion database.", "create_database_entry", {
        database_id: SENTINEL,
        properties: {
          Name: { title: [{ text: { content: "{{gmail-read.subject}}" } }] },
          Summary: { rich_text: [{ text: { content: "{{summarize-email.summary}}" } }] },
          Source: { url: "{{gmail-read.url}}" },
        },
      }, "write"),
      connectionNode(6, "gmail-label", "gmail", "Mark as logged", "Adds the handled label in Gmail.", "label_email", {
        message_id: "{{loop-emails.email.id}}",
        label_ids: ["Logged to Notion"],
      }, "read_write"),
    ],
  }),
  makeProgram({
    id: "premade-asana-standup-to-slack",
    name: "Asana Standup to Slack",
    description: "Collect today and overdue Asana tasks, summarize blockers, and post the standup brief to Slack.",
    tags: ["asana", "slack", "standup"],
    nodes: [
      cronTrigger(0, "trigger-1", "Weekday morning", "Runs every weekday at 8:30am UTC.", "30 8 * * 1-5"),
      connectionNode(1, "asana-tasks", "asana", "List active tasks", "Reads open tasks from an Asana project.", "list_tasks", {
        project_id: SENTINEL,
        assignee: "me",
      }, "read"),
      stepNode(2, "skip-empty", "Skip empty days", "Stops when there are no active tasks.", {
        logic_type: "filter",
        condition: "len(data.get('tasks', [])) > 0",
        pass_schema: null,
      }),
      agentNode(3, "standup-writer", "Write standup brief", "Turns the task list into a tight Slack update.", "Create a standup update grouped by due today, overdue, blockers, and likely follow-ups. Keep it under 12 lines."),
      connectionNode(4, "slack-post", "slack", "Post to Slack", "Sends the standup brief to the team channel.", "send_message", {
        channel: SENTINEL,
        text: "{{standup-writer.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-github-pr-digest-to-slack",
    name: "GitHub PR Digest to Slack",
    description: "Send a daily Slack digest of open pull requests, risky diffs, and stale reviews.",
    tags: ["github", "slack", "engineering"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily PR check", "Runs every weekday afternoon.", "0 15 * * 1-5"),
      connectionNode(1, "github-prs", "github", "List pull requests", "Fetches open PRs from a repository.", "list_prs", {
        owner: SENTINEL,
        repo: SENTINEL,
        state: "open",
      }, "read"),
      agentNode(2, "pr-summary", "Summarize PRs", "Highlights stale, large, and blocked pull requests.", "Summarize open PRs for an engineering channel. Call out stale reviews, risky large changes, and clear owner actions."),
      connectionNode(3, "slack-post", "slack", "Post digest", "Posts the PR digest to Slack.", "send_message", {
        channel: SENTINEL,
        text: "{{pr-summary.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-typeform-leads-to-hubspot",
    name: "Typeform Leads to HubSpot",
    description: "Turn completed Typeform responses into qualified HubSpot contacts and alert sales in Slack.",
    tags: ["typeform", "hubspot", "sales"],
    nodes: [
      eventTrigger(0, "trigger-1", "typeform", "response.completed"),
      connectionNode(1, "typeform-responses", "typeform", "Fetch responses", "Reads recent Typeform submissions.", "get_responses", {
        form_id: SENTINEL,
        page_size: 25,
        completed: true,
      }, "read"),
      stepNode(2, "loop-responses", "Loop responses", "Processes each completed response.", {
        logic_type: "loop",
        over: "data['responses']",
        item_var: "response",
      }),
      agentNode(3, "qualify-lead", "Qualify lead", "Extracts fit, urgency, and routing notes.", "Qualify the lead from the response. Return a concise sales note with company, need, urgency, and next action."),
      connectionNode(4, "hubspot-contact", "hubspot", "Create HubSpot contact", "Creates or enriches a CRM contact.", "create_contact", {
        properties: {
          email: "{{loop-responses.response.email}}",
          firstname: "{{loop-responses.response.first_name}}",
          lastname: "{{loop-responses.response.last_name}}",
          lifecyclestage: "lead",
          notes_last_contacted: "{{qualify-lead.summary}}",
        },
      }, "write"),
      connectionNode(5, "slack-alert", "slack", "Alert sales", "Posts the qualified lead to Slack.", "send_message", {
        channel: SENTINEL,
        text: "New qualified Typeform lead: {{qualify-lead.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-hubspot-contacts-to-sheets",
    name: "HubSpot Contacts to Sheets",
    description: "Append recently created HubSpot contacts into a Google Sheet for reporting and enrichment.",
    tags: ["hubspot", "sheets", "crm"],
    nodes: [
      cronTrigger(0, "trigger-1", "Hourly sync", "Runs once per hour.", "0 * * * *"),
      connectionNode(1, "hubspot-contacts", "hubspot", "List contacts", "Reads recent HubSpot contacts.", "list_contacts", {
        limit: 100,
        properties: ["email", "firstname", "lastname", "createdate", "lifecyclestage"],
      }, "read"),
      stepNode(2, "loop-contacts", "Loop contacts", "Processes each contact.", {
        logic_type: "loop",
        over: "data['contacts']",
        item_var: "contact",
      }),
      connectionNode(3, "sheets-row", "sheets", "Append Sheet row", "Adds the contact to the reporting sheet.", "append_row", {
        spreadsheet_id: SENTINEL,
        range: "Contacts",
        values: [["{{loop-contacts.contact.email}}", "{{loop-contacts.contact.firstname}}", "{{loop-contacts.contact.lastname}}", "{{loop-contacts.contact.lifecyclestage}}"]],
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-airtable-overdue-to-asana",
    name: "Airtable Overdue to Asana",
    description: "Find overdue Airtable records, create Asana follow-up tasks, and notify the owner channel.",
    tags: ["airtable", "asana", "operations"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily overdue scan", "Runs every workday morning.", "15 8 * * 1-5"),
      connectionNode(1, "airtable-records", "airtable", "Find overdue records", "Reads Airtable records marked overdue.", "list_records", {
        base_id: SENTINEL,
        table_name: SENTINEL,
        filter_formula: "AND({Status}!='Done', IS_BEFORE({Due Date}, TODAY()))",
        max_records: 100,
      }, "read"),
      stepNode(2, "loop-records", "Loop records", "Processes each overdue item.", {
        logic_type: "loop",
        over: "data['records']",
        item_var: "record",
      }),
      connectionNode(3, "asana-task", "asana", "Create follow-up task", "Creates an Asana task for the overdue record.", "create_task", {
        workspace_id: SENTINEL,
        project_id: SENTINEL,
        name: "Overdue: {{loop-records.record.fields.Name}}",
        notes: "{{loop-records.record.fields.Notes}}",
        due_on: "{{loop-records.record.fields.Due Date}}",
      }, "write"),
      connectionNode(4, "slack-message", "slack", "Notify Slack", "Posts the overdue item to Slack.", "send_message", {
        channel: SENTINEL,
        text: "Created Asana follow-up for overdue Airtable item: {{loop-records.record.fields.Name}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-calendar-brief-to-slack",
    name: "Calendar Meeting Brief to Slack",
    description: "Send the team a daily agenda with meeting context, attendees, and likely prep work.",
    tags: ["calendar", "slack", "daily"],
    nodes: [
      cronTrigger(0, "trigger-1", "Morning agenda", "Runs every weekday morning.", "0 7 * * 1-5"),
      connectionNode(1, "calendar-events", "calendar", "List today's events", "Reads the day's calendar events.", "list_events", {
        calendar_id: "primary",
        time_min: "{{today_start_iso}}",
        time_max: "{{today_end_iso}}",
        max_results: 20,
      }, "read"),
      agentNode(2, "brief-writer", "Write meeting brief", "Creates a concise meeting prep summary.", "Write a meeting brief grouped by time. Include attendees, missing agenda risks, and suggested prep. Keep it easy to scan."),
      connectionNode(3, "slack-post", "slack", "Post agenda", "Posts the agenda brief to Slack.", "send_message", {
        channel: SENTINEL,
        text: "{{brief-writer.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-notion-tasks-to-gmail",
    name: "Notion Task Digest to Gmail",
    description: "Email yourself a morning digest of due and overdue Notion tasks.",
    tags: ["notion", "gmail", "tasks"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily task digest", "Runs every morning.", "0 6 * * *"),
      connectionNode(1, "notion-tasks", "notion", "Query tasks", "Reads due tasks from a Notion database.", "query_database", {
        database_id: SENTINEL,
        filter: { property: "Status", select: { does_not_equal: "Done" } },
        page_size: 100,
      }, "read"),
      stepNode(2, "skip-empty", "Skip empty digest", "Stops when there are no tasks.", {
        logic_type: "filter",
        condition: "len(data.get('results', [])) > 0",
        pass_schema: null,
      }),
      agentNode(3, "digest-writer", "Write email digest", "Formats the tasks into a clear email.", "Write a concise task digest grouped by due date and priority. Include only actionable details."),
      connectionNode(4, "gmail-send", "gmail", "Send digest", "Emails the task digest.", "send_email", {
        to: SENTINEL,
        subject: "Today's Notion task digest",
        body: "{{digest-writer.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-outlook-vip-to-asana",
    name: "Outlook VIP Triage to Asana",
    description: "Scan unread VIP Outlook email, create follow-up Asana tasks, and alert Slack.",
    tags: ["outlook", "asana", "slack"],
    nodes: [
      cronTrigger(0, "trigger-1", "VIP inbox scan", "Runs every 30 minutes during weekdays.", "*/30 * * * 1-5"),
      connectionNode(1, "outlook-list", "outlook", "Find VIP email", "Reads unread VIP messages.", "list_emails", {
        folder: "Inbox",
        top: 20,
        filter: "isRead eq false",
      }, "read"),
      stepNode(2, "loop-email", "Loop emails", "Processes each VIP message.", {
        logic_type: "loop",
        over: "data['messages']",
        item_var: "message",
      }),
      connectionNode(3, "outlook-read", "outlook", "Read email", "Loads the full email body.", "read_email", {
        message_id: "{{loop-email.message.id}}",
      }, "read"),
      agentNode(4, "triage-email", "Triage email", "Decides whether a task is needed.", "Classify the email urgency and draft a task title and notes for any required follow-up."),
      connectionNode(5, "asana-task", "asana", "Create task", "Creates a follow-up task in Asana.", "create_task", {
        workspace_id: SENTINEL,
        project_id: SENTINEL,
        name: "{{triage-email.title}}",
        notes: "{{triage-email.summary}}",
      }, "write"),
      connectionNode(6, "slack-alert", "slack", "Notify Slack", "Posts the triage summary.", "send_message", {
        channel: SENTINEL,
        text: "VIP email triaged: {{triage-email.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-sheets-rows-to-hubspot-deals",
    name: "Sheets Rows to HubSpot Deals",
    description: "Create HubSpot deals from new rows in a Google Sheet sales intake table.",
    tags: ["sheets", "hubspot", "sales"],
    nodes: [
      cronTrigger(0, "trigger-1", "Quarter-hour intake", "Runs every 15 minutes.", "*/15 * * * *"),
      connectionNode(1, "sheets-read", "sheets", "Read intake rows", "Reads new sales intake rows.", "read_range", {
        spreadsheet_id: SENTINEL,
        range: "Intake!A2:H",
      }, "read"),
      stepNode(2, "loop-rows", "Loop rows", "Processes each intake row.", {
        logic_type: "loop",
        over: "data['values']",
        item_var: "row",
      }),
      connectionNode(3, "hubspot-deal", "hubspot", "Create deal", "Creates a deal in HubSpot.", "create_deal", {
        properties: {
          dealname: "{{loop-rows.row.0}}",
          amount: "{{loop-rows.row.3}}",
          pipeline: "default",
          dealstage: "appointmentscheduled",
        },
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-webhook-bug-to-github-notion",
    name: "Webhook Bug Report to GitHub",
    description: "Receive bug reports by webhook, open a GitHub issue, and archive context in Notion.",
    tags: ["github", "notion", "webhook"],
    nodes: [
      webhookTrigger(0, "trigger-1", "Bug report webhook", "bug-report"),
      stepNode(1, "shape-report", "Shape report", "Normalizes the incoming bug report.", {
        logic_type: "transform",
        transformation: "{'title': data.get('title', 'Bug report'), 'body': data.get('body', data), 'severity': data.get('severity', 'triage')}",
        input_schema: null,
        output_schema: null,
      }),
      connectionNode(2, "github-issue", "github", "Create GitHub issue", "Creates an issue for triage.", "create_issue", {
        owner: SENTINEL,
        repo: SENTINEL,
        title: "{{shape-report.title}}",
        body: "{{shape-report.body}}",
        labels: ["bug", "{{shape-report.severity}}"],
      }, "write"),
      connectionNode(3, "notion-log", "notion", "Archive in Notion", "Stores the report and issue link in Notion.", "create_database_entry", {
        database_id: SENTINEL,
        properties: {
          Name: { title: [{ text: { content: "{{shape-report.title}}" } }] },
          Severity: { select: { name: "{{shape-report.severity}}" } },
          Issue: { url: "{{github-issue.html_url}}" },
        },
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-drive-contract-watch",
    name: "Drive Contract Watch",
    description: "Find recently changed contract files in Drive, log them in Notion, and notify legal in Slack.",
    tags: ["drive", "notion", "legal"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily contract scan", "Runs each morning.", "0 8 * * 1-5"),
      connectionNode(1, "drive-files", "drive", "Find contract files", "Searches Drive for recently changed contract files.", "list_files", {
        query: "name contains 'contract' and trashed=false",
        page_size: 25,
      }, "read"),
      stepNode(2, "loop-files", "Loop files", "Processes each matching file.", {
        logic_type: "loop",
        over: "data['files']",
        item_var: "file",
      }),
      connectionNode(3, "drive-metadata", "drive", "Read metadata", "Fetches file metadata.", "get_file_metadata", {
        file_id: "{{loop-files.file.id}}",
      }, "read"),
      connectionNode(4, "notion-entry", "notion", "Log contract", "Adds the file to a Notion contract tracker.", "create_database_entry", {
        database_id: SENTINEL,
        properties: {
          Name: { title: [{ text: { content: "{{drive-metadata.name}}" } }] },
          Link: { url: "{{drive-metadata.webViewLink}}" },
        },
      }, "write"),
      connectionNode(5, "slack-post", "slack", "Notify legal", "Posts the changed contract to Slack.", "send_message", {
        channel: SENTINEL,
        text: "Contract file updated: {{drive-metadata.name}} {{drive-metadata.webViewLink}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-weekly-docs-report-from-sheets",
    name: "Weekly Sheets Report to Docs",
    description: "Read a metrics sheet, draft a weekly summary document, and email the link to stakeholders.",
    tags: ["sheets", "docs", "gmail"],
    nodes: [
      cronTrigger(0, "trigger-1", "Monday report", "Runs every Monday morning.", "0 9 * * 1"),
      connectionNode(1, "sheets-read", "sheets", "Read metrics", "Loads the metrics table.", "read_range", {
        spreadsheet_id: SENTINEL,
        range: "Metrics!A1:Z100",
      }, "read"),
      agentNode(2, "report-writer", "Draft weekly report", "Turns spreadsheet data into a summary.", "Create an executive weekly report with wins, risks, metric movements, and suggested next actions."),
      connectionNode(3, "docs-create", "docs", "Create Google Doc", "Creates a weekly report document.", "create_document", {
        title: "Weekly metrics report - {{date}}",
        content: "{{report-writer.summary}}",
      }, "write"),
      connectionNode(4, "gmail-send", "gmail", "Email report", "Emails the report link.", "send_email", {
        to: SENTINEL,
        subject: "Weekly metrics report",
        body: "The weekly report is ready: {{docs-create.document_url}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-hubspot-stale-deals-reminder",
    name: "HubSpot Stale Deals Reminder",
    description: "Find stale HubSpot deals, summarize risk, and create follow-up tasks for sales.",
    tags: ["hubspot", "asana", "slack"],
    nodes: [
      cronTrigger(0, "trigger-1", "Daily deal check", "Runs every weekday morning.", "45 8 * * 1-5"),
      connectionNode(1, "hubspot-deals", "hubspot", "List deals", "Reads active HubSpot deals.", "list_deals", {
        limit: 100,
      }, "read"),
      agentNode(2, "risk-summary", "Score stale deals", "Identifies deals that need follow-up.", "Review the deals and identify stale or risky opportunities. Return clear follow-up tasks and Slack-ready notes."),
      connectionNode(3, "asana-task", "asana", "Create sales task", "Creates a sales follow-up task.", "create_task", {
        workspace_id: SENTINEL,
        project_id: SENTINEL,
        name: "Follow up stale HubSpot deals",
        notes: "{{risk-summary.summary}}",
      }, "write"),
      connectionNode(4, "slack-post", "slack", "Post risk summary", "Posts deal risks to Slack.", "send_message", {
        channel: SENTINEL,
        text: "{{risk-summary.summary}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-typeform-nps-detractors",
    name: "Typeform NPS Detractor Alert",
    description: "Detect low NPS responses, update HubSpot, and alert the customer success channel.",
    tags: ["typeform", "hubspot", "support"],
    nodes: [
      cronTrigger(0, "trigger-1", "Hourly NPS scan", "Runs once per hour.", "0 * * * *"),
      connectionNode(1, "typeform-responses", "typeform", "Read NPS responses", "Loads recent Typeform responses.", "get_responses", {
        form_id: SENTINEL,
        page_size: 50,
        completed: true,
      }, "read"),
      stepNode(2, "filter-low", "Keep detractors", "Keeps low-score responses.", {
        logic_type: "filter",
        condition: "any(int(r.get('score', 10)) <= 6 for r in data.get('responses', []))",
        pass_schema: null,
      }),
      stepNode(3, "loop-responses", "Loop responses", "Processes each response.", {
        logic_type: "loop",
        over: "data['responses']",
        item_var: "response",
      }),
      connectionNode(4, "hubspot-update", "hubspot", "Update contact", "Writes NPS context to HubSpot.", "update_contact", {
        contact_id: "{{loop-responses.response.contact_id}}",
        properties: {
          nps_score: "{{loop-responses.response.score}}",
          latest_nps_comment: "{{loop-responses.response.comment}}",
        },
      }, "write"),
      connectionNode(5, "slack-alert", "slack", "Alert success", "Posts the detractor alert to Slack.", "send_message", {
        channel: SENTINEL,
        text: "NPS detractor: {{loop-responses.response.email}} scored {{loop-responses.response.score}}. {{loop-responses.response.comment}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-notion-content-to-calendar",
    name: "Notion Content to Calendar",
    description: "Turn planned Notion content items into Google Calendar publishing events.",
    tags: ["notion", "calendar", "content"],
    nodes: [
      manualTrigger(0, "trigger-1", "Plan publishing calendar"),
      connectionNode(1, "notion-content", "notion", "Query content plan", "Reads planned content from Notion.", "query_database", {
        database_id: SENTINEL,
        filter: { property: "Status", select: { equals: "Planned" } },
        page_size: 100,
      }, "read"),
      stepNode(2, "loop-items", "Loop content", "Processes each content item.", {
        logic_type: "loop",
        over: "data['results']",
        item_var: "item",
      }),
      connectionNode(3, "calendar-event", "calendar", "Create calendar event", "Creates a publishing calendar entry.", "create_event", {
        calendar_id: "primary",
        summary: "Publish: {{loop-items.item.properties.Name.title.0.text.content}}",
        start: "{{loop-items.item.properties.Publish Date.date.start}}",
        end: "{{loop-items.item.properties.Publish Date.date.start}}",
        description: "{{loop-items.item.url}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-gmail-support-to-github",
    name: "Gmail Support Escalation",
    description: "Find urgent support emails, summarize the issue, open a GitHub ticket, and alert Slack.",
    tags: ["gmail", "github", "support"],
    nodes: [
      cronTrigger(0, "trigger-1", "Support inbox scan", "Runs every 10 minutes.", "*/10 * * * *"),
      connectionNode(1, "gmail-search", "gmail", "Search urgent mail", "Finds urgent support emails.", "search", {
        query: 'label:support (urgent OR outage OR broken) newer_than:1d',
        max_results: 20,
      }, "read"),
      stepNode(2, "loop-emails", "Loop emails", "Processes each support email.", {
        logic_type: "loop",
        over: "data['emails']",
        item_var: "email",
      }),
      connectionNode(3, "gmail-read", "gmail", "Read email", "Loads the full email body.", "read_email", {
        message_id: "{{loop-emails.email.id}}",
      }, "read"),
      agentNode(4, "support-summary", "Summarize incident", "Turns the email into an actionable issue.", "Summarize the support problem as a GitHub issue with customer impact, reproduction clues, and urgency."),
      connectionNode(5, "github-issue", "github", "Create GitHub issue", "Creates an engineering escalation ticket.", "create_issue", {
        owner: SENTINEL,
        repo: SENTINEL,
        title: "{{support-summary.title}}",
        body: "{{support-summary.summary}}",
        labels: ["support", "urgent"],
      }, "write"),
      connectionNode(6, "slack-alert", "slack", "Alert support", "Posts the escalation to Slack.", "send_message", {
        channel: SENTINEL,
        text: "Support escalation created: {{github-issue.html_url}}",
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-slack-channel-to-notion-digest",
    name: "Slack Channel to Notion Digest",
    description: "Summarize a busy Slack channel every day and archive decisions in Notion.",
    tags: ["slack", "notion", "digest"],
    nodes: [
      cronTrigger(0, "trigger-1", "End-of-day digest", "Runs every weekday evening.", "0 18 * * 1-5"),
      connectionNode(1, "slack-read", "slack", "Read channel", "Reads recent channel messages.", "read_channel", {
        channel: SENTINEL,
        limit: 100,
      }, "read"),
      agentNode(2, "digest-writer", "Write digest", "Extracts decisions, owners, and unresolved questions.", "Summarize the Slack channel into decisions, owner/action items, unresolved questions, and links worth saving."),
      connectionNode(3, "notion-log", "notion", "Archive digest", "Creates a Notion digest entry.", "create_database_entry", {
        database_id: SENTINEL,
        properties: {
          Name: { title: [{ text: { content: "Slack digest - {{date}}" } }] },
          Summary: { rich_text: [{ text: { content: "{{digest-writer.summary}}" } }] },
        },
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-airtable-low-stock-alert",
    name: "Airtable Low Stock Alert",
    description: "Find low inventory items, email purchasing, and append a replenishment row to Sheets.",
    tags: ["airtable", "gmail", "sheets"],
    nodes: [
      cronTrigger(0, "trigger-1", "Morning inventory scan", "Runs every weekday morning.", "0 7 * * 1-5"),
      connectionNode(1, "airtable-stock", "airtable", "Find low stock", "Reads Airtable inventory records below reorder point.", "list_records", {
        base_id: SENTINEL,
        table_name: SENTINEL,
        filter_formula: "{Quantity} <= {Reorder Point}",
        max_records: 100,
      }, "read"),
      stepNode(2, "loop-items", "Loop items", "Processes each low-stock item.", {
        logic_type: "loop",
        over: "data['records']",
        item_var: "item",
      }),
      connectionNode(3, "gmail-email", "gmail", "Email purchasing", "Sends a reorder alert.", "send_email", {
        to: SENTINEL,
        subject: "Low stock: {{loop-items.item.fields.Name}}",
        body: "Quantity is {{loop-items.item.fields.Quantity}}. Reorder point is {{loop-items.item.fields.Reorder Point}}.",
      }, "write"),
      connectionNode(4, "sheets-log", "sheets", "Log reorder", "Adds a row to the reorder log.", "append_row", {
        spreadsheet_id: SENTINEL,
        range: "Reorders",
        values: [["{{loop-items.item.fields.Name}}", "{{loop-items.item.fields.Quantity}}", "{{date}}"]],
      }, "write"),
    ],
  }),
  makeProgram({
    id: "premade-calendar-followups-to-gmail",
    name: "Calendar Follow-ups to Gmail",
    description: "Review yesterday's meetings and send yourself drafted follow-up emails.",
    tags: ["calendar", "gmail", "meetings"],
    nodes: [
      cronTrigger(0, "trigger-1", "Morning follow-ups", "Runs every weekday morning.", "30 7 * * 1-5"),
      connectionNode(1, "calendar-events", "calendar", "Read yesterday's meetings", "Loads yesterday's calendar events.", "list_events", {
        calendar_id: "primary",
        time_min: "{{yesterday_start_iso}}",
        time_max: "{{yesterday_end_iso}}",
        max_results: 20,
      }, "read"),
      agentNode(2, "followup-writer", "Draft follow-ups", "Creates follow-up email drafts from meetings.", "Write concise follow-up email drafts for meetings that likely need next steps. Include recipient, subject, and body for each."),
      connectionNode(3, "gmail-send", "gmail", "Send follow-up draft", "Emails the drafted follow-up to yourself for review.", "send_email", {
        to: SENTINEL,
        subject: "Meeting follow-up drafts",
        body: "{{followup-writer.summary}}",
      }, "write"),
    ],
  }),
];

export function findPremadeBrowseProgram(id: string): BrowseProgram | undefined {
  return PREMADE_BROWSE_PROGRAMS.find((program) => program.id === id);
}

export function filterPremadeBrowsePrograms(params: { tag?: string; tags?: string[]; q?: string }, sort: "latest" | "popular" = "latest"): BrowseProgram[] {
  const normalizedQ = params.q?.trim().toLowerCase();
  const tags = params.tags?.length ? params.tags : params.tag ? [params.tag] : [];

  const filtered = PREMADE_BROWSE_PROGRAMS.filter((program) => {
    if (tags.some((tag) => !program.tags.includes(tag))) return false;
    if (!normalizedQ) return true;

    const searchable = [
      program.name,
      program.description ?? "",
      program.tags.join(" "),
      program.node_summary.connections_needed.join(" "),
    ].join(" ").toLowerCase();

    return searchable.includes(normalizedQ);
  }).map(({ schema, ...program }) => program);

  if (sort === "popular") {
    filtered.sort((a, b) => b.fork_count - a.fork_count);
  }

  return filtered;
}

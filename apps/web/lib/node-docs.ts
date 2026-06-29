import { CONNECTOR_OPERATIONS, OPERATION_SCOPES } from "@/lib/connectors/catalog";
import {
  OPERATION_PARAM_FIELDS,
  type ParamField,
} from "@/lib/connectors/operation-params";
import { getOperationFieldHelp } from "@/lib/field-help";
import {
  nodeDocFieldUrl,
  nodeDocPathForConnectorOperation,
} from "@/lib/node-doc-paths";
import type { SeoPage } from "@/lib/seo/content";

type Link = SeoPage["internalLinks"][number];
type TableRow = [string, string, string];

const LAST_MODIFIED = "2026-06-30";

const docsHome: Link = {
  href: "/docs",
  label: "Main docs",
  description: "Workflow schema, runtime, and governance documentation.",
};

const nodeIndexLink: Link = {
  href: "/docs/nodes",
  label: "Node field chooser",
  description: "Start here, choose the exact node, then review every field for that node.",
};

const PROVIDER_LABELS: Record<string, string> = {
  airtable: "Airtable",
  asana: "Asana",
  calendar: "Google Calendar",
  docs: "Google Docs",
  drive: "Google Drive",
  github: "GitHub",
  gmail: "Gmail",
  hubspot: "HubSpot",
  notion: "Notion",
  outlook: "Outlook",
  sheets: "Google Sheets",
  slack: "Slack",
  thunderbird: "Thunderbird",
  typeform: "Typeform",
};

const PROVIDER_REFERENCES: Record<string, Link[]> = {
  airtable: [
    {
      href: "https://airtable.com/developers/web/api/introduction",
      label: "Airtable API docs",
      description: "Official Airtable API reference for bases, tables, records, and formulas.",
    },
    {
      href: "https://support.airtable.com/docs/formula-field-reference",
      label: "Airtable formulas",
      description: "Official formula syntax reference for filter formulas.",
    },
  ],
  asana: [
    {
      href: "https://developers.asana.com/docs/asana-gids",
      label: "Asana GIDs",
      description: "Official guide to Asana global identifiers.",
    },
    {
      href: "https://developers.asana.com/docs/get-a-project",
      label: "Asana projects",
      description: "Official project API guidance.",
    },
  ],
  calendar: [
    {
      href: "https://support.google.com/calendar/answer/6225189",
      label: "Google Calendar IDs",
      description: "Official help for finding calendar IDs.",
    },
    {
      href: "https://developers.google.com/calendar/api/v3/reference/events",
      label: "Calendar events API",
      description: "Official event resource reference.",
    },
  ],
  docs: [
    {
      href: "https://developers.google.com/docs/api/how-tos/overview",
      label: "Google Docs API",
      description: "Official Google Docs API overview.",
    },
    {
      href: "https://developers.google.com/drive/api/guides/about-files",
      label: "Google Drive files",
      description: "Google Docs document discovery uses Drive file IDs.",
    },
  ],
  drive: [
    {
      href: "https://developers.google.com/drive/api/guides/about-files",
      label: "Google Drive files",
      description: "Official Drive file and folder ID reference.",
    },
    {
      href: "https://developers.google.com/drive/api/guides/search-files",
      label: "Drive query syntax",
      description: "Official guide for Drive file search queries.",
    },
  ],
  github: [
    {
      href: "https://docs.github.com/en/rest/repos/repos",
      label: "GitHub repositories API",
      description: "Official repository API reference.",
    },
    {
      href: "https://docs.github.com/en/rest/issues/issues",
      label: "GitHub issues API",
      description: "Official issue resource reference.",
    },
  ],
  gmail: [
    {
      href: "https://support.google.com/mail/answer/7190",
      label: "Gmail search operators",
      description: "Official Gmail search syntax for query fields.",
    },
    {
      href: "https://developers.google.com/gmail/api/reference/rest/v1/users.messages",
      label: "Gmail messages API",
      description: "Official message and attachment identifier reference.",
    },
  ],
  hubspot: [
    {
      href: "https://developers.hubspot.com/docs/api/crm/contacts",
      label: "HubSpot contacts API",
      description: "Official contact record reference.",
    },
    {
      href: "https://developers.hubspot.com/docs/api/crm/pipelines",
      label: "HubSpot pipelines",
      description: "Official pipeline and deal stage guidance.",
    },
  ],
  notion: [
    {
      href: "https://developers.notion.com/reference/page",
      label: "Notion pages",
      description: "Official Notion page reference.",
    },
    {
      href: "https://developers.notion.com/reference/database",
      label: "Notion databases",
      description: "Official database reference.",
    },
  ],
  outlook: [
    {
      href: "https://learn.microsoft.com/en-us/graph/api/resources/message",
      label: "Microsoft Graph messages",
      description: "Official Outlook message resource reference.",
    },
    {
      href: "https://learn.microsoft.com/en-us/graph/api/resources/mailfolder",
      label: "Microsoft Graph mail folders",
      description: "Official mail folder reference.",
    },
  ],
  sheets: [
    {
      href: "https://developers.google.com/sheets/api/guides/concepts",
      label: "Google Sheets concepts",
      description: "Official guide for spreadsheet IDs and Sheets concepts.",
    },
    {
      href: "https://developers.google.com/sheets/api/guides/concepts#a1_notation",
      label: "A1 notation",
      description: "Official range notation reference.",
    },
  ],
  slack: [
    {
      href: "https://api.slack.com/reference/conversations",
      label: "Slack conversations",
      description: "Official channel and conversation reference.",
    },
    {
      href: "https://api.slack.com/block-kit/building",
      label: "Slack Block Kit",
      description: "Official rich message block reference.",
    },
  ],
  thunderbird: [
    {
      href: "https://datatracker.ietf.org/doc/html/rfc3501",
      label: "IMAP reference",
      description: "Official IMAP protocol reference for mailbox folders and UIDs.",
    },
  ],
  typeform: [
    {
      href: "https://www.typeform.com/developers/get-started/",
      label: "Typeform developer docs",
      description: "Official Typeform API start page.",
    },
    {
      href: "https://www.typeform.com/developers/responses/reference/retrieve-responses/",
      label: "Typeform responses",
      description: "Official response retrieval reference.",
    },
  ],
};

const commonFieldRows: TableRow[] = [
  [
    "label",
    "The short display name shown on the workflow canvas. It is for human review and does not change runtime behavior.",
    "Type a concise action name such as Read invoice, Classify lead, or Notify owner. Avoid IDs, secrets, and long instructions.",
  ],
  [
    "description",
    "A reviewer note for what the node does, why it exists, and what a teammate should check before changing it.",
    "Write operational context only. Do not paste OAuth tokens, API keys, private customer data, or provider secrets into this field.",
  ],
];

const retryRows: TableRow[] = [
  [
    "retry.max_attempts",
    "Total attempts for this node, including the first try. Use 1 when the operation should not retry.",
    "Allowed range in the sidebar is 1 to 5. Use retries for provider outages, network blips, or rate limits, not for invalid inputs.",
  ],
  [
    "retry.backoff",
    "How Corelyx waits between attempts after a failure.",
    "Options: none retries immediately, linear adds the base seconds each time, exponential grows the wait from the base. Exponential is usually best for rate limits.",
  ],
  [
    "retry.backoff_base_seconds",
    "The first wait time used by linear or exponential backoff.",
    "Enter seconds. Start low for quick temporary failures; use a larger value when the provider documents rate limit recovery windows.",
  ],
  [
    "retry.fail_program_on_exhaust",
    "Controls whether the whole workflow fails when this node runs out of attempts.",
    "Options: on fails the run so later nodes do not execute with missing data; off lets later paths continue if they can safely handle failure.",
  ],
];

const agentRows: TableRow[] = [
  ...commonFieldRows,
  [
    "api_key_ref",
    "Selects the stored model credential. Corelyx Platform Key uses platform credits; personal keys use the provider account saved in Corelyx.",
    "Choose an existing key from the dropdown. Add or rotate personal keys in account settings. Never paste raw provider keys into prompts or descriptions.",
  ],
  [
    "model",
    "The model identifier sent to the selected provider or platform key.",
    "Use one of the Corelyx presets or the exact provider model slug supported by the chosen key. If a model fails, verify the slug in the provider model list.",
  ],
  [
    "scope_access",
    "Limits what connected resources the agent may use through tools.",
    "Options: read can inspect data, write can create or change data, read_write can do both. Choose the least capability that completes the task.",
  ],
  [
    "system_prompt",
    "Instructions for role, constraints, allowed behavior, and expected output shape.",
    "Be specific about success criteria, format, refusal boundaries, and any required evidence. Use operation fields, not the prompt, for external IDs and credentials.",
  ],
  [
    "requires_approval",
    "Pauses the run for human approval before the agent executes.",
    "Options: off for low-risk summarization or classification; on for sensitive, customer-visible, irreversible, or write-capable actions.",
  ],
  [
    "approval_timeout_hours",
    "How long Corelyx waits for a reviewer before the approval step expires.",
    "Enter hours. Use short values for urgent operational workflows and longer values for compliance or legal review queues.",
  ],
  ...retryRows,
];

const agentTaskRows: TableRow[] = [
  ...commonFieldRows,
  [
    "objective",
    "Plain-language task goal for a bounded autonomous tool loop.",
    "Write the expected outcome, constraints, and stopping condition. Keep it narrow enough to complete within the configured iteration limit.",
  ],
  [
    "api_key_ref",
    "The stored model key used by the task loop.",
    "Choose Corelyx Platform Key or a saved provider key. Keep raw model credentials out of editable text fields.",
  ],
  [
    "model",
    "The model identifier for the task loop.",
    "Use a model available to the selected key. Prefer a stronger model for multi-step tool use and a cheaper model for simple reasoning-only tasks.",
  ],
  [
    "max_iterations",
    "Hard ceiling on model-tool turns so the task cannot run unbounded.",
    "Allowed schema range is 1 to 25. Start low; increase only when the task needs several discovery or update steps.",
  ],
  [
    "tools",
    "Allow-listed tool IDs the task may call.",
    "Empty means reasoning only. Add only the connector tools needed for this task; write tools should usually be paired with approval.",
  ],
  [
    "scope_access",
    "Highest side-effect level allowed for the task.",
    "Options: read, write, read_write. Choose read unless the task must create, update, move, send, or delete something.",
  ],
  [
    "requires_approval",
    "Requires a human decision before write or side-effecting tool calls.",
    "Turn on for external messages, record changes, destructive actions, or customer-impacting updates.",
  ],
  [
    "approval_timeout_hours",
    "How long the run waits for the approval decision.",
    "Enter hours. Match the timeout to the owner team's review SLA.",
  ],
  ...retryRows,
];

const triggerRows: TableRow[] = [
  ...commonFieldRows,
  [
    "trigger_type",
    "Selects what starts the workflow.",
    "Options: manual starts only when a user runs it; cron uses a schedule; webhook receives HTTP requests; event listens for a named source event; program_output listens to another Corelyx program; file_watch listens on a paired desktop device.",
  ],
  [
    "expression",
    "The cron expression used when trigger_type is cron.",
    "Use five fields: minute, hour, day of month, month, day of week. Example: 0 9 * * 1-5 runs weekdays at 09:00 in the configured timezone.",
  ],
  [
    "timezone",
    "IANA timezone used to evaluate cron schedules.",
    "Use values such as UTC, Europe/Vienna, or America/New_York. Choose the business timezone for reports, reminders, and handoffs.",
  ],
  [
    "method",
    "HTTP method accepted by a webhook trigger.",
    "Options: POST or GET. Most provider webhooks use POST. Use GET only for systems that can only call a simple URL.",
  ],
  [
    "source",
    "Named event source for event triggers.",
    "Use the exact source emitted by the upstream system, for example gmail, slack, billing, or an internal event source name.",
  ],
  [
    "event",
    "Named event to match for event triggers.",
    "Use the exact event name from the producer, such as message.received, invoice.created, or run.completed.",
  ],
  [
    "source_program_id",
    "Corelyx program UUID used by program_output triggers.",
    "Open the source program and copy the UUID from the /programs/<id> URL. Copy only the ID, not the whole URL.",
  ],
  [
    "on_status",
    "Program-output statuses that should start this workflow.",
    "Options: success, failed, partial. Select success for normal chaining; include failed or partial only for incident handling or cleanup flows.",
  ],
  [
    "device_id",
    "Paired desktop device used by file_watch triggers.",
    "Choose a listed device or Default device. Pair devices in Corelyx Desktop before using local file triggers.",
  ],
  [
    "path",
    "Folder path watched by the paired desktop device.",
    "Use an absolute path inside a folder granted in Corelyx Desktop, such as C:\\Users\\you\\Invoices.",
  ],
  [
    "events",
    "File change kinds that should fire the workflow.",
    "Options: created, modified, deleted. Keep at least one enabled. Use deleted only for cleanup or audit workflows.",
  ],
  [
    "patterns",
    "Optional filename filters for file_watch triggers.",
    "Use comma-separated globs such as *.pdf, invoice-*.csv. Leave empty to match every filename in the watched folder.",
  ],
];

const logicTypeRow: TableRow = [
  "logic_type",
  "Selects the step operation that runs between nodes.",
  "Data options: transform, filter, format, parse, deduplicate, sort. Flow options: branch, loop, delay. Choose a specific step page below for its fields.",
];

const stepRows: TableRow[] = [
  ...commonFieldRows,
  logicTypeRow,
];

const stepVariants: Array<{
  key: string;
  label: string;
  summary: string;
  rows: TableRow[];
  example: string;
}> = [
  {
    key: "transform",
    label: "Transform step",
    summary: "Transforms upstream data with a JavaScript expression.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "transformation",
        "JavaScript expression that receives upstream data as input and returns the new value.",
        "Use input to access upstream data. Example: input.items.map(item => ({ id: item.id, name: item.title })). Keep expressions deterministic and small.",
      ],
    ],
    example: "input.items.map(item => ({ id: item.id, name: item.title }))",
  },
  {
    key: "filter",
    label: "Filter step",
    summary: "Passes or stops data based on a truthy or falsy expression.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "condition",
        "JavaScript expression evaluated against upstream input.",
        "Truthy means the data continues. Falsy stops this path. Example: input.status === 'active' && input.score > 0.8.",
      ],
    ],
    example: "input.status === 'active' && input.score > 0.8",
  },
  {
    key: "branch",
    label: "Branch step",
    summary: "Routes data to another node based on ordered conditions.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "conditions",
        "Ordered branch rules. Corelyx checks them in order and follows the first matching rule.",
        "Add one condition and one target node ID per branch arm. Put the most specific conditions first.",
      ],
      [
        "conditions[].condition",
        "JavaScript expression for one branch arm.",
        "Use upstream input. Example: input.priority === 'high'. When true, Corelyx routes to the matching target node.",
      ],
      [
        "conditions[].target_node_id",
        "The node ID that should run when that condition matches.",
        "Select the target node on the canvas and copy its node ID from the sidebar. Use the ID, not the label.",
      ],
      [
        "default_branch",
        "Fallback node ID when no condition matches.",
        "Copy a target node ID or leave empty to stop the path when no branch condition is true.",
      ],
    ],
    example: "input.priority === 'high'",
  },
  {
    key: "delay",
    label: "Delay step",
    summary: "Waits before continuing to downstream nodes.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "seconds",
        "Number of seconds to pause execution.",
        "The sidebar clamps values between 0 and 300 seconds. Use short delays for rate limiting, not long business waits.",
      ],
    ],
    example: "30",
  },
  {
    key: "loop",
    label: "Loop step",
    summary: "Runs downstream work once for each item in an array.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "over",
        "Expression that resolves to an array.",
        "Use a path such as input.items, input.emails, or a previous node output. If the expression is not an array, the loop cannot iterate.",
      ],
      [
        "item_var",
        "Variable name for the current item.",
        "Use a short name like item, email, row, or record. Downstream expressions use this name for the current loop item.",
      ],
    ],
    example: "input.items",
  },
  {
    key: "format",
    label: "Format step",
    summary: "Builds a text value from a template.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "template",
        "String template that inserts values from upstream data.",
        "Use placeholders such as {name} or {amount}. The field names must exist in upstream input.",
      ],
      [
        "output_key",
        "Output field where the formatted string is stored.",
        "Use a simple key such as text, summary, subject, or message. Downstream nodes can reference this key.",
      ],
    ],
    example: "Invoice {invoice_number} is due on {due_date}",
  },
  {
    key: "parse",
    label: "Parse step",
    summary: "Parses text into structured output.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "input_key",
        "Upstream output key that contains the text to parse.",
        "Use the key from the previous node output, such as text, body, or csv.",
      ],
      [
        "format",
        "Parser format for the input text.",
        "Options: json parses an object or array, csv parses comma-separated rows, lines splits one line per item. Match the real upstream format.",
      ],
    ],
    example: "json",
  },
  {
    key: "deduplicate",
    label: "Deduplicate step",
    summary: "Removes duplicate items by a key field.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "dedup.key",
        "Field used to identify duplicates in input.items.",
        "Use a stable identifier such as id, email, invoice_number, or external_id. Items with the same key collapse to one result.",
      ],
    ],
    example: "email",
  },
  {
    key: "sort",
    label: "Sort step",
    summary: "Sorts items by a selected field.",
    rows: [
      ...commonFieldRows,
      logicTypeRow,
      [
        "sort.key",
        "Field used to order input.items.",
        "Use a field that exists on every item, such as created_at, due_date, amount, or priority.",
      ],
      [
        "order",
        "Sort direction.",
        "Options: asc for ascending order, desc for descending order. Use asc for oldest-to-newest or A-to-Z; desc for newest-first or largest-first.",
      ],
    ],
    example: "created_at desc",
  },
];

const oauthRows: TableRow[] = [
  ...commonFieldRows,
  [
    "connection",
    "The linked account used for the connector node.",
    "Connect accounts from the Connections page, then choose the account that owns the document, mailbox, channel, base, repository, or project you want.",
  ],
  [
    "conn_operation",
    "The provider operation this node will execute.",
    "Choose the exact provider action. Once selected, Corelyx shows the operation-specific fields documented on that operation page.",
  ],
  [
    "conn_scope_access",
    "The node's read/write permission level for the connected account.",
    "Options: read for listing or reading, write for creating or changing, read_write for both. Choose the least capability needed.",
  ],
  [
    "scope_required",
    "OAuth scopes Corelyx expects for the selected operation.",
    "Usually filled automatically from the connector catalog. If a picker is empty or an operation is denied, reconnect with the required scopes.",
  ],
  [
    "operation_params_json",
    "Fallback JSON editor for operations without structured fields.",
    "Use valid JSON. Use {{node_id.field}} references for values discovered at runtime. Prefer structured fields when available.",
  ],
];

const fileRows: TableRow[] = [
  ...commonFieldRows,
  [
    "device_id",
    "Paired desktop device that executes the local file operation.",
    "Choose a listed device or Default device. Pair the computer in Corelyx Desktop before running local file nodes.",
  ],
  [
    "operation",
    "Local filesystem action executed by Corelyx Desktop.",
    "Options: read, write, append, list, stat, move, copy, delete, mkdir, search. Write, append, move, copy, delete, and mkdir need write-capable scope.",
  ],
  [
    "operation_params.path",
    "File or folder path inside a granted desktop folder.",
    "Use an absolute path, for example C:\\Users\\you\\Invoices\\report.pdf. The path must be under a folder granted in Corelyx Desktop.",
  ],
  [
    "operation_params.content",
    "Text written or appended by write and append operations.",
    "Type text directly or use {{node_id.field}} to insert upstream output. Do not write secrets unless the destination is approved for them.",
  ],
  [
    "operation_params.dest",
    "Destination path for move and copy operations.",
    "Use an absolute path under a granted folder. Both source and destination must be accessible to the desktop bridge.",
  ],
  [
    "operation_params.pattern",
    "Filename substring used by search.",
    "Enter the part of the filename to match, such as invoice, report, or .pdf.",
  ],
  [
    "conn_scope_access",
    "The local file permission level for this node.",
    "Options: read for list/read/stat/search, write for create or modify, read_write for both and destructive movement/deletion. Use the least permission possible.",
  ],
];

const httpRows: TableRow[] = [
  ...commonFieldRows,
  [
    "http_method",
    "HTTP verb used for the request.",
    "Options: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Use the verb required by the external API endpoint.",
  ],
  [
    "url",
    "Full endpoint URL.",
    "Copy the endpoint from the provider API docs and include https://. Use query params fields for dynamic URL query values when possible.",
  ],
  [
    "auth_type",
    "How Corelyx authenticates the HTTP request.",
    "Options: none, bearer, basic, api_key_header, api_key_query. Match the API provider's authentication docs.",
  ],
  [
    "auth_value",
    "Credential value for the selected auth type.",
    "Bearer/API key: paste the token or key. Basic: use username:password. Keep this field secret and avoid echoing it to logs or downstream outputs.",
  ],
  [
    "query_params",
    "Key/value pairs appended after the question mark in the URL.",
    "Use parameter names from the endpoint docs. Add one row per parameter. Values can use {{node_id.field}} references.",
  ],
  [
    "headers",
    "HTTP request headers.",
    "Use exact header names required by the API, such as Content-Type, Accept, Authorization, or X-API-Key.",
  ],
  [
    "body",
    "Raw request body.",
    "Use valid JSON when the API expects JSON and set Content-Type accordingly. For form APIs, follow the provider docs exactly.",
  ],
  [
    "parse_response",
    "Controls whether Corelyx parses the response body as JSON.",
    "Options: on parses JSON for downstream fields; off keeps the raw response text. Turn off for plain text, HTML, or binary-like responses.",
  ],
  [
    "timeout_seconds",
    "How long Corelyx waits before failing the request.",
    "Enter seconds. Use longer values only for endpoints known to be slow.",
  ],
  [
    "http_retry",
    "Enables retry behavior for temporary HTTP failures.",
    "Options: off sends one request; on uses max attempts and backoff settings. Be careful retrying non-idempotent POST requests.",
  ],
  ...retryRows,
];

function titleCase(value: string) {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? titleCase(provider);
}

function operationLabel(operation: string) {
  return titleCase(operation);
}

function fieldRequirement(field: ParamField) {
  return field.required ? "Required field." : "Optional field.";
}

function fieldInputFormat(field: ParamField) {
  const placeholder = field.placeholder ? ` Placeholder: ${field.placeholder}.` : "";
  const hint = field.hint ? ` Connector hint: ${field.hint}.` : "";

  if (field.type === "array") {
    return `Type: array. In the sidebar, enter comma-separated values; Corelyx stores them as an array.${placeholder}${hint}`;
  }
  if (field.type === "json") {
    return `Type: JSON. Enter valid JSON and validate brackets, quotes, and object shape before running.${placeholder}${hint}`;
  }
  if (field.type === "boolean") {
    return `Type: boolean toggle. Turn it on or off for this operation.${hint}`;
  }
  if (field.type === "number") {
    return `Type: number. Enter digits only unless the provider specifically accepts another format.${placeholder}${hint}`;
  }
  if (field.type === "text") {
    return `Type: long text. It can include upstream references such as {{node_id.field}}.${placeholder}${hint}`;
  }
  return `Type: text. It can include upstream references such as {{node_id.field}}.${placeholder}${hint}`;
}

function whereToFindField(provider: string, field: ParamField) {
  const key = field.key;

  if (provider === "docs" && key === "document_id") {
    return "Use the Google Doc dropdown when connected. To paste manually, open the document and copy the value between /document/d/ and /edit in docs.google.com/document/d/<DOCUMENT_ID>/edit. Google Docs files are discovered through Google Drive file IDs.";
  }
  if (provider === "sheets" && key === "spreadsheet_id") {
    return "Use the spreadsheet dropdown when connected. To paste manually, open the sheet and copy the value between /spreadsheets/d/ and /edit in docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit.";
  }
  if (provider === "drive" && key === "file_id") {
    return "Use the Drive file dropdown when connected. To paste manually, open the file share URL and copy the ID after /d/ or the id query parameter.";
  }
  if (provider === "drive" && (key === "folder_id" || key === "parent_id")) {
    return "Use the Drive folder dropdown when connected. To paste manually, open the folder and copy the value after /folders/ in the URL.";
  }
  if (provider === "calendar" && key === "calendar_id") {
    return "Use the calendar dropdown when connected, use primary for the main calendar, or open Google Calendar settings and copy the Calendar ID for shared calendars.";
  }
  if (provider === "notion" && key.includes("database_id")) {
    return "Use the Notion database dropdown when connected. To paste manually, open the database and copy the long database ID from the URL. Make sure the integration has access to that database.";
  }
  if (provider === "notion" && (key.includes("page_id") || key === "parent_id")) {
    return "Use the Notion page or parent dropdown when connected. To paste manually, open the page and copy the long page ID from the URL. Share the page with the Notion integration first.";
  }
  if (provider === "airtable" && key === "base_id") {
    return "Use the base dropdown when connected. To paste manually, use the Airtable base ID, usually starting with app, from Airtable's API/developer view.";
  }
  if (provider === "airtable" && key === "table_name") {
    return "Choose a table after selecting a base, or paste the exact table name as it appears in Airtable. Table names are case-sensitive for many workflows.";
  }
  if (provider === "slack" && key === "channel") {
    return "Use the channel dropdown when connected. To paste manually, use a visible channel name such as #general or a Slack conversation ID that usually starts with C, G, or D.";
  }
  if (provider === "github" && key === "owner") {
    return "Use the owner from the GitHub repository URL. In https://github.com/octocat/hello-world, the owner is octocat.";
  }
  if (provider === "github" && key === "repo") {
    return "Use the repository name from the GitHub URL, or choose an owner/repo value from the repository dropdown when connected.";
  }
  if (provider === "hubspot" && key.endsWith("_id")) {
    return "Use the connected-account picker when available, or copy the record ID from HubSpot record URLs/API results. For pipeline and deal stage values, use HubSpot pipeline settings or the pipelines API.";
  }
  if (provider === "typeform" && key === "form_id") {
    return "Use the Typeform form dropdown when connected. To paste manually, copy the form ID from a public form URL such as typeform.com/to/<FORM_ID> or from the Typeform API.";
  }
  if (provider === "asana" && key.endsWith("_id")) {
    return "Use the Asana picker when connected, or copy the GID from Asana API/list output. Task and project URLs often contain the same numeric GID.";
  }
  if (provider === "outlook" && (key === "folder" || key === "destination_folder")) {
    return "Use the mail folder dropdown when connected. You can also use well-known names such as inbox, archive, deleteditems, and sentitems where the operation supports them.";
  }
  if (provider === "thunderbird" && key === "uid") {
    return "Use the UID returned by a Thunderbird list_messages, search_messages, or get_message result. IMAP UIDs are mailbox-specific, so keep the folder value with the UID.";
  }
  if (key === "range") {
    return "Use Google Sheets A1 notation, for example Sheet1!A1:D10. The sheet name must match the tab name, including spaces when present.";
  }
  if (key === "values") {
    return "Use a two-dimensional JSON array, where each inner array is one row. Example: [[\"Name\", \"Status\"], [\"Alice\", \"Active\"]].";
  }
  if (key === "query" && provider === "gmail") {
    return "Use Gmail search syntax such as from:person@example.com is:unread newer_than:7d. Check Gmail search operator docs for exact syntax.";
  }
  if (key === "query" && provider === "drive") {
    return "Use Google Drive query syntax such as name contains 'report' and trashed=false. Check the Drive search files guide for exact operators.";
  }
  if (key.includes("id") || key === "uid") {
    return "Use a previous list/search/read operation, an incoming trigger payload, or the provider URL/API result that contains this identifier. Copy only the ID value, not the full URL.";
  }
  if (field.type === "boolean") {
    return "Use the toggle in the sidebar. On means Corelyx sends true; off means Corelyx sends false or omits the option depending on the operation.";
  }
  if (field.type === "json") {
    return "Use the provider's API docs for the expected object shape. Validate JSON before running and prefer upstream references for dynamic values.";
  }
  if (field.type === "array") {
    return "Enter comma-separated values in the sidebar or supply an upstream array. Check provider docs for accepted item names, labels, IDs, or scopes.";
  }
  return "Type the value directly, choose it from the connected-account picker when one appears, or insert a runtime value with {{node_id.field}} from an earlier node.";
}

function operationRows(provider: string, operation: string): TableRow[] {
  const scopes = OPERATION_SCOPES[provider]?.[operation] ?? [];
  const fields = OPERATION_PARAM_FIELDS[provider]?.[operation] ?? [];
  const providerName = providerLabel(provider);
  const operationName = `${provider}.${operation}`;

  const rows: TableRow[] = [
    ...commonFieldRows,
    [
      "connection",
      `Linked ${providerName} account used for this operation.`,
      `Choose the connected account that can access the target resource. If a dropdown is empty, reconnect the account or verify the resource is visible to that account.`,
    ],
    [
      "conn_operation",
      `Operation selected for this node: ${operationName}.`,
      `In the operation dropdown, choose ${operation}. This page documents the fields shown after that selection.`,
    ],
    [
      "conn_scope_access",
      "Permission level Corelyx should allow for this connector node.",
      "Options: read, write, read_write. Use read for list/read operations, write for create/update/send/delete operations, and read_write only when both are needed.",
    ],
    [
      "scope_required",
      "OAuth scopes or provider permissions expected for this operation.",
      scopes.length > 0
        ? `Corelyx fills these automatically for ${operationName}: ${scopes.join(", ")}. Reconnect the account if the saved connection lacks them.`
        : `This operation has no provider OAuth scope listed in the Corelyx catalog. The connector may use existing account permissions or a non-OAuth credential model.`,
    ],
  ];

  if (fields.length === 0) {
    rows.push([
      "operation_params",
      "This operation has no structured parameter fields in the current Corelyx sidebar.",
      "Choose the connection and operation, then run or connect downstream nodes. If the provider later requires fields, add them to OPERATION_PARAM_FIELDS so the UI and docs stay aligned.",
    ]);
    return rows;
  }

  for (const field of fields) {
    const help = getOperationFieldHelp(provider, operation, field);
    rows.push([
      field.key,
      `${field.label}. ${fieldRequirement(field)} ${fieldInputFormat(field)} ${help.description}`,
      whereToFindField(provider, field),
    ]);
  }

  return rows;
}

function makePage(input: {
  path: `/${string}`;
  title: string;
  shortTitle: string;
  headline: string;
  summary: string;
  definition: string;
  primaryQuery: string;
  entityTerms: string[];
  rows: TableRow[];
  links: Link[];
  checklist: string[];
  faqs: SeoPage["faqs"];
  codeExample?: SeoPage["codeExample"];
  linkGroups?: SeoPage["linkGroups"];
}): SeoPage {
  return {
    path: input.path,
    section: "docs",
    title: input.title,
    shortTitle: input.shortTitle,
    description: input.summary,
    eyebrow: "Node field docs",
    headline: input.headline,
    summary: input.summary,
    definition: input.definition,
    audience: "Workflow builders, operators, developers, and reviewers configuring Corelyx nodes.",
    lastModified: LAST_MODIFIED,
    primaryQuery: input.primaryQuery,
    entityTerms: input.entityTerms,
    keyPoints: [
      "Start by choosing the exact node or provider operation you are configuring.",
      "Every editable sidebar field on the selected node is documented with type, purpose, options, and value source.",
      "Fields that point to external services explain whether to use the connected-account picker, a provider URL, or a previous operation output.",
      "Use upstream references like {{node_id.field}} when a value should be discovered during the run instead of pasted manually.",
    ],
    implementationSteps: [
      { name: "Choose the node", text: "Use the node chooser to open the page for the exact trigger, agent, step, HTTP, local file, or provider operation node." },
      { name: "Match the sidebar", text: "Compare the field names in the sidebar with the table on the node page. Required operation parameters are marked in their row." },
      { name: "Prefer pickers", text: "When Corelyx can list resources from the connected account, choose the resource from the dropdown instead of pasting an ID." },
      { name: "Use runtime IDs", text: "For records or messages discovered during a run, use a previous list/search/read node output with {{node_id.field}}." },
    ],
    table: {
      caption: `${input.shortTitle} fields and options`,
      headers: ["Field", "How to use it", "Options and where to find values"],
      rows: input.rows,
    },
    checklist: input.checklist,
    codeExample: input.codeExample ?? {
      title: "Upstream value reference",
      language: "txt",
      code: "{{node_id.field}}",
    },
    faqs: input.faqs,
    internalLinks: [nodeIndexLink, docsHome, ...input.links],
    linkGroups: input.linkGroups,
  };
}

function connectorOperationPage(provider: string, operation: string): SeoPage {
  const providerName = providerLabel(provider);
  const opLabel = operationLabel(operation);
  const path = nodeDocPathForConnectorOperation(provider, operation) as `/${string}`;
  const rows = operationRows(provider, operation);
  const fields = OPERATION_PARAM_FIELDS[provider]?.[operation] ?? [];
  const required = fields.filter((field) => field.required).map((field) => field.key);

  return makePage({
    path,
    title: `${providerName} ${opLabel} Node Field Reference`,
    shortTitle: `${providerName} ${opLabel}`,
    headline: `${providerName} ${opLabel} node fields`,
    summary: `Use this page when the connector node is set to ${provider}.${operation}. It documents the connection selector, operation selector, scope fields, and every operation parameter shown in the sidebar.`,
    definition: `The ${provider}.${operation} node is a Corelyx OAuth or connector operation node that calls ${providerName} through a connected account and passes the configured parameters to the runtime connector.`,
    primaryQuery: `Corelyx ${providerName} ${operation} node fields`,
    entityTerms: [
      `${providerName} connector node`,
      `${provider}.${operation}`,
      ...fields.map((field) => `${providerName} ${field.label}`),
    ],
    rows,
    links: PROVIDER_REFERENCES[provider] ?? [],
    checklist: [
      `Choose a ${providerName} connection that can access the target resource.`,
      required.length > 0
        ? `Fill required parameters before running: ${required.join(", ")}.`
        : "This operation has no required structured parameters in the sidebar.",
      "Use the connected-account picker when it appears; paste IDs only when the picker cannot list the resource.",
      "Use {{node_id.field}} for IDs discovered by earlier list, search, trigger, or read operations.",
    ],
    faqs: [
      {
        question: `Where do I find IDs for ${providerName} ${opLabel}?`,
        answer:
          "Use the field table on this page. Resource rows explain the connected-account picker, the provider URL segment to copy, or the previous operation output that contains the ID.",
      },
      {
        question: `Why is a ${providerName} picker empty?`,
        answer:
          "The connected account may not have access to matching resources, may need additional scopes, or may not support listing that resource. Reconnect the account or paste the ID manually if you know it.",
      },
    ],
  });
}

const stepLinks: Link[] = stepVariants.map((step) => ({
  href: `/docs/nodes/steps/${step.key}`,
  label: step.label,
  description: step.summary,
}));

const baseNodeLinks: Link[] = [
  { href: "/docs/nodes/common", label: "Common node fields", description: "Label and description fields that appear on every node." },
  { href: "/docs/nodes/trigger", label: "Trigger node", description: "Manual, cron, webhook, event, program output, and file watch trigger fields." },
  { href: "/docs/nodes/agent", label: "Agent node", description: "Model, prompt, approval, scope, and retry fields for AI agent nodes." },
  { href: "/docs/nodes/agent-task", label: "Agent task node", description: "Bounded autonomous task fields for agent programs." },
  { href: "/docs/nodes/steps", label: "Step node chooser", description: "Choose transform, filter, branch, loop, delay, format, parse, deduplicate, or sort." },
  { href: "/docs/nodes/oauth-connector", label: "OAuth connector base", description: "Connection, operation, scopes, and fallback parameter fields." },
  { href: "/docs/nodes/http-request", label: "HTTP request node", description: "Method, URL, auth, headers, body, timeout, JSON parsing, and retry fields." },
  { href: "/docs/nodes/local-file", label: "Local file node", description: "Desktop device, file operation, granted paths, content, destination, search, and scope fields." },
];

function connectorOperationEntries() {
  const providers = new Set([
    ...Object.keys(CONNECTOR_OPERATIONS),
    ...Object.keys(OPERATION_PARAM_FIELDS),
  ]);

  return Array.from(providers).map((provider) => {
    const opNames = new Set([
      ...(CONNECTOR_OPERATIONS[provider] ?? []),
      ...Object.keys(OPERATION_PARAM_FIELDS[provider] ?? {}),
    ]);

    return [provider, Array.from(opNames)] as const;
  });
}

const connectorOperationLinks: Link[] = connectorOperationEntries().flatMap(([provider, opNames]) => {
  return opNames.map((operation) => ({
    href: nodeDocPathForConnectorOperation(provider, operation),
    label: `${providerLabel(provider)} - ${operationLabel(operation)}`,
    description: `Every sidebar field for ${provider}.${operation}.`,
  }));
});

const connectorGroups = connectorOperationEntries().map(([provider, opNames]) => {
  return {
    title: `${providerLabel(provider)} connector nodes`,
    description: `Choose the exact ${providerLabel(provider)} operation before reading field guidance.`,
    links: opNames.map((operation) => ({
      href: nodeDocPathForConnectorOperation(provider, operation),
      label: operationLabel(operation),
      description: `${provider}.${operation} fields, required params, pickers, and IDs.`,
    })),
  };
});

const nodeIndexPage = makePage({
  path: "/docs/nodes",
  title: "Corelyx Node Field Documentation Chooser",
  shortTitle: "Node Docs",
  headline: "Choose the exact node before reading field docs.",
  summary:
    "Corelyx node docs are organized by the specific node or provider operation you are configuring, so users do not have to translate broad field categories back to the sidebar.",
  definition:
    "A Corelyx node field reference page documents one concrete node shape: common node fields, a trigger type, a step operation, an HTTP or local file connector, or a provider operation such as docs.read_document.",
  primaryQuery: "Corelyx node field documentation",
  entityTerms: ["Corelyx node fields", "workflow node docs", "connector operation docs"],
  rows: [
    ["common", "Fields shared by all nodes: label and description.", "Use this when the help icon appears next to identity fields."],
    ["trigger", "Fields that start workflows.", "Choose this for manual, cron, webhook, event, program output, and file watch triggers."],
    ["agent", "Fields for model-backed AI agent nodes.", "Choose this for API key, model, prompt, approval, scope, and retry settings."],
    ["steps", "Fields for data and control-flow step nodes.", "Choose the specific step operation: transform, filter, branch, loop, delay, format, parse, deduplicate, or sort."],
    ["connectors", "Fields for provider operation nodes.", "Choose the provider and operation, for example Google Docs - Read Document."],
    ["http-request", "Fields for direct HTTP API request nodes.", "Use this for custom APIs, headers, auth, body, timeout, and retries."],
    ["local-file", "Fields for Corelyx Desktop local file nodes.", "Use this for granted folders, local file paths, move/copy/delete, and desktop device selection."],
  ],
  links: [...baseNodeLinks, ...stepLinks, ...connectorOperationLinks],
  linkGroups: [
    {
      title: "Core node types",
      description: "Start here for nodes that are not tied to one external provider operation.",
      links: baseNodeLinks,
    },
    {
      title: "Step operation nodes",
      description: "Step fields change depending on the selected operation.",
      links: stepLinks,
    },
    ...connectorGroups,
  ],
  checklist: [
    "Open the node-specific page instead of a broad field category.",
    "Use the field table anchors from Learn more links to jump to the exact field.",
    "For provider nodes, verify both the operation and connection match the page you are reading.",
    "Use external provider links when an ID or syntax is provider-specific.",
  ],
  faqs: [
    {
      question: "Why are docs organized by node now?",
      answer:
        "The sidebar changes fields based on node type, trigger type, step operation, provider, and operation. Node-first docs match what users actually see.",
    },
    {
      question: "Where should I start for Google Docs Document ID?",
      answer:
        "Choose Google Docs - Read Document, Append Text, Append To Document, or Replace Text, then read the document_id row. The row explains both the picker and the URL segment to copy.",
    },
  ],
});

const commonNodePage = makePage({
  path: "/docs/nodes/common",
  title: "Common Corelyx Node Fields",
  shortTitle: "Common Node Fields",
  headline: "Common node fields appear on every node.",
  summary: "Use this page for the label and description fields shown in the identity section of every Corelyx node sidebar.",
  definition: "Common node fields are human-readable metadata fields shared by trigger, agent, step, connector, note, and group nodes.",
  primaryQuery: "Corelyx common node fields",
  entityTerms: ["Corelyx label field", "Corelyx description field"],
  rows: commonFieldRows,
  links: baseNodeLinks,
  checklist: [
    "Use a label that describes the action.",
    "Use the description for review notes and assumptions.",
    "Keep credentials and private data out of human-readable metadata.",
  ],
  faqs: [
    { question: "Do labels affect execution?", answer: "No. Runtime behavior comes from the validated node config. Labels help humans understand the graph." },
    { question: "Can descriptions contain upstream references?", answer: "Descriptions are notes. Put upstream references in executable fields such as prompt, body, path, or operation parameters." },
  ],
});

const agentNodePage = makePage({
  path: "/docs/nodes/agent",
  title: "Corelyx Agent Node Fields",
  shortTitle: "Agent Node",
  headline: "Agent node fields control model work, approvals, and retries.",
  summary: "Use this page for the AI agent node sidebar: API key, model, scope, system prompt, human approval, approval timeout, and retry settings.",
  definition: "A Corelyx agent node calls a configured model with a system prompt and governance controls, then returns structured or unstructured output to downstream nodes.",
  primaryQuery: "Corelyx agent node fields",
  entityTerms: ["Corelyx AI agent node", "system prompt field", "human approval field"],
  rows: agentRows,
  links: [nodeIndexLink],
  checklist: [
    "Choose a model supported by the selected key.",
    "Use the least scope access that can complete the node's work.",
    "Turn on approval for sensitive, customer-visible, or write-capable agent actions.",
    "Use retries for temporary failures, not bad prompts or missing inputs.",
  ],
  faqs: [
    { question: "Where do I find model IDs?", answer: "Use the provider's model list for the selected key or one of the Corelyx presets shown in the sidebar." },
    { question: "Should every agent require approval?", answer: "No. Require approval when the action is sensitive, irreversible, high-impact, or external-facing." },
  ],
});

const agentTaskNodePage = makePage({
  path: "/docs/nodes/agent-task",
  title: "Corelyx Agent Task Node Fields",
  shortTitle: "Agent Task Node",
  headline: "Agent task fields bound autonomous tool loops.",
  summary: "Use this page for agent task nodes in agent programs: objective, model, max iterations, tools, approval, scope, and retry behavior.",
  definition: "A Corelyx agent task node is a bounded tool-using loop that can reason and call allow-listed tools while staying inside a fixed, user-approved plan.",
  primaryQuery: "Corelyx agent task node fields",
  entityTerms: ["Corelyx agent task", "bounded tool loop", "agent max iterations"],
  rows: agentTaskRows,
  links: [nodeIndexLink, { href: "/docs/nodes/agent", label: "Agent node", description: "Standard agent model, prompt, approval, and retry fields." }],
  checklist: [
    "Write an objective with a clear stopping condition.",
    "Keep the tool allow-list narrow.",
    "Use approval before side-effecting tools.",
    "Keep max_iterations as low as practical.",
  ],
  faqs: [
    { question: "Is an agent task the same as a workflow agent node?", answer: "No. Agent task nodes are bounded tool loops for agent programs. Standard agent nodes are fixed graph steps." },
    { question: "What happens when max_iterations is reached?", answer: "The task must stop instead of continuing unbounded. Increase the limit only when the task genuinely needs more tool turns." },
  ],
});

const triggerNodePage = makePage({
  path: "/docs/nodes/trigger",
  title: "Corelyx Trigger Node Fields",
  shortTitle: "Trigger Node",
  headline: "Trigger node fields define when a workflow starts.",
  summary: "Use this page for manual, cron, webhook, event, program-output, and desktop file-watch trigger settings.",
  definition: "A Corelyx trigger node defines the event, schedule, webhook, program status, or local desktop file change that starts a workflow run.",
  primaryQuery: "Corelyx trigger node fields",
  entityTerms: ["Corelyx cron trigger", "webhook trigger", "file watch trigger", "program output trigger"],
  rows: triggerRows,
  links: [
    { href: "https://en.wikipedia.org/wiki/Cron", label: "Cron reference", description: "Background reference for cron expression structure." },
    { href: "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones", label: "IANA timezones", description: "Reference list of timezone identifiers." },
  ],
  checklist: [
    "Use the correct business timezone for schedules.",
    "Treat webhook URLs and tokens as sensitive.",
    "Use file-watch patterns to avoid noisy runs.",
    "Copy program IDs and node IDs exactly, not labels.",
  ],
  faqs: [
    { question: "Where do I find a source program ID?", answer: "Open the source program and copy the UUID segment from the /programs/<id> URL." },
    { question: "Do file-watch contents leave my machine?", answer: "The watch event is local through Corelyx Desktop. Later connector nodes decide whether file contents are read or sent elsewhere." },
  ],
});

const stepsIndexPage = makePage({
  path: "/docs/nodes/steps",
  title: "Corelyx Step Node Chooser",
  shortTitle: "Step Nodes",
  headline: "Choose the exact step operation.",
  summary: "Step node fields change depending on the selected operation, so choose transform, filter, branch, delay, loop, format, parse, deduplicate, or sort before reading field details.",
  definition: "A Corelyx step node transforms data or controls workflow flow between trigger, agent, and connector nodes.",
  primaryQuery: "Corelyx step node fields",
  entityTerms: ["Corelyx transform step", "Corelyx branch step", "workflow data step"],
  rows: stepRows,
  links: stepLinks,
  linkGroups: [
    {
      title: "Step operation nodes",
      description: "Open the operation that matches the Step sidebar selection.",
      links: stepLinks,
    },
  ],
  checklist: [
    "Choose the operation in the Step sidebar first.",
    "Use small expressions that are easy to test.",
    "Use node IDs, not labels, for branch targets.",
    "Match parse format to the upstream text format.",
  ],
  faqs: [
    { question: "Why are step docs split by operation?", answer: "The Step sidebar renders different editable fields for each logic_type, so each operation has its own page." },
    { question: "Can a step call an external API?", answer: "Step fields should transform or route local input. Use HTTP or connector nodes for external API calls." },
  ],
});

const stepVariantPages = stepVariants.map((step) =>
  makePage({
    path: `/docs/nodes/steps/${step.key}` as `/${string}`,
    title: `Corelyx ${step.label} Fields`,
    shortTitle: step.label,
    headline: `${step.label} fields`,
    summary: step.summary,
    definition: `A ${step.label.toLowerCase()} is a Corelyx step node with logic_type set to ${step.key}.`,
    primaryQuery: `Corelyx ${step.key} step fields`,
    entityTerms: [`Corelyx ${step.key} step`, "workflow step field"],
    rows: step.rows,
    links: stepLinks.filter((link) => link.href !== `/docs/nodes/steps/${step.key}`),
    checklist: [
      "Confirm the Step operation dropdown matches this page.",
      "Validate expressions or keys against real upstream output.",
      "Use {{node_id.field}} in downstream nodes after this step produces output.",
    ],
    codeExample: {
      title: `${step.label} example`,
      language: "txt",
      code: step.example,
    },
    faqs: [
      { question: `When should I use ${step.label}?`, answer: step.summary },
      { question: "Where do I find upstream field names?", answer: "Use the previous node output, run logs, or the debug panel to inspect available fields." },
    ],
  }),
);

const oauthNodePage = makePage({
  path: "/docs/nodes/oauth-connector",
  title: "Corelyx OAuth Connector Base Fields",
  shortTitle: "OAuth Connector Base",
  headline: "OAuth connector base fields choose the account and operation.",
  summary: "Use this page for connection, operation, scope, required scopes, and raw JSON fallback fields before opening the provider-operation page.",
  definition: "An OAuth connector node uses a linked external account and a selected operation to read from or write to a provider through server-side credential handling.",
  primaryQuery: "Corelyx OAuth connector fields",
  entityTerms: ["Corelyx connector account", "OAuth scopes", "operation params JSON"],
  rows: oauthRows,
  links: connectorOperationLinks.slice(0, 20),
  checklist: [
    "Choose the connected account first.",
    "Choose the operation second.",
    "Open the exact provider-operation docs page for operation parameters.",
    "Reconnect the account if required scopes are missing.",
  ],
  faqs: [
    { question: "Why do operation fields appear only after choosing an operation?", answer: "Each provider operation has a different parameter schema, so the sidebar renders structured fields only after the operation is selected." },
    { question: "Can I paste IDs manually?", answer: "Yes. Use a picker when available; paste IDs manually when the picker cannot list the resource or the ID comes from an earlier run." },
  ],
});

const fileNodePage = makePage({
  path: "/docs/nodes/local-file",
  title: "Corelyx Local File Node Fields",
  shortTitle: "Local File Node",
  headline: "Local file node fields run desktop file operations inside granted folders.",
  summary: "Use this page for Corelyx Desktop local file operations: device, operation, path, content, destination, search, and file scope.",
  definition: "A Corelyx local file node executes a filesystem operation on a paired desktop device through folder grants rather than provider OAuth tokens.",
  primaryQuery: "Corelyx local file node fields",
  entityTerms: ["Corelyx Desktop file node", "local file operation", "granted folder"],
  rows: fileRows,
  links: [nodeIndexLink],
  checklist: [
    "Pair the desktop device before running local file nodes.",
    "Grant only the folders the workflow needs.",
    "Use absolute paths inside granted folders.",
    "Review destructive delete, move, and overwrite operations carefully.",
  ],
  faqs: [
    { question: "Can a local file node access the whole computer?", answer: "No. It should operate only inside folders granted through Corelyx Desktop." },
    { question: "Can path fields use upstream values?", answer: "Yes. Use {{node_id.field}} when a previous node produces the path or filename." },
  ],
});

const httpNodePage = makePage({
  path: "/docs/nodes/http-request",
  title: "Corelyx HTTP Request Node Fields",
  shortTitle: "HTTP Request Node",
  headline: "HTTP request fields configure direct API calls.",
  summary: "Use this page for custom HTTP request nodes: method, URL, auth, query params, headers, body, JSON parsing, timeout, and retry behavior.",
  definition: "A Corelyx HTTP request node calls a custom API endpoint without a first-party connector, using the request fields configured in the sidebar.",
  primaryQuery: "Corelyx HTTP request node fields",
  entityTerms: ["Corelyx HTTP node", "HTTP auth type", "API request body"],
  rows: httpRows,
  links: [
    { href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods", label: "HTTP methods", description: "MDN reference for HTTP request methods." },
    { href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers", label: "HTTP headers", description: "MDN reference for common request headers." },
    { href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types", label: "MIME types", description: "MDN reference for content types." },
  ],
  checklist: [
    "Use HTTPS endpoints.",
    "Match method, auth type, headers, and body shape to the provider docs.",
    "Keep auth values secret and out of downstream logs.",
    "Be careful retrying non-idempotent POST or PATCH requests.",
  ],
  faqs: [
    { question: "Where do I find an API key?", answer: "Use the external provider's developer dashboard or API settings. Corelyx cannot discover private API keys for custom HTTP APIs." },
    { question: "Should I parse every response as JSON?", answer: "Only enable JSON parsing when the API returns JSON. Leave it off for plain text, HTML, or binary responses." },
  ],
});

const connectorPages = connectorOperationEntries().flatMap(([provider, opNames]) =>
  opNames.map((operation) => connectorOperationPage(provider, operation)),
);

export const nodeDocPages: SeoPage[] = [
  nodeIndexPage,
  commonNodePage,
  triggerNodePage,
  agentNodePage,
  agentTaskNodePage,
  stepsIndexPage,
  ...stepVariantPages,
  oauthNodePage,
  fileNodePage,
  httpNodePage,
  ...connectorPages,
];

export const nodeDocPagePaths = nodeDocPages.map((page) => page.path);

export function getConnectorOperationDocUrl(provider: string, operation: string, fieldKey: string) {
  return nodeDocFieldUrl(nodeDocPathForConnectorOperation(provider, operation), fieldKey);
}

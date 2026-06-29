export type FieldHelpEntry = {
  title: string;
  description: string;
  learnMoreUrl?: string;
  externalUrl?: string;
  externalLabel?: string;
};

export type OperationFieldHelpContext = {
  key: string;
  label: string;
  type?: string;
  hint?: string;
  placeholder?: string;
};

const url = (page: string, anchor: string) => `/docs/fields/${page}#${anchor}`;

const IDENTITY: Record<string, FieldHelpEntry> = {
  label: {
    title: "Label",
    description: "The display name shown on this node in the editor canvas. Use a short name that explains the node's job.",
    learnMoreUrl: url("identity", "label"),
  },
  description: {
    title: "Description",
    description: "A note for teammates explaining what this node does, why it exists, or what to check before changing it.",
    learnMoreUrl: url("identity", "description"),
  },
};

const AGENT: Record<string, FieldHelpEntry> = {
  api_key_ref: {
    title: "API Key",
    description: "Which stored model key this agent uses. Corelyx Platform Key uses platform credits instead of a personal provider key.",
    learnMoreUrl: url("agent", "api-key"),
  },
  model: {
    title: "Model",
    description: "The model identifier sent to the selected provider. It must be available for the selected API key or platform key.",
    learnMoreUrl: url("agent", "model"),
  },
  scope_access: {
    title: "Scope access",
    description: "The permission level this agent has over connected resources. Read can fetch data; write can create or change data.",
    learnMoreUrl: url("agent", "scope-access"),
  },
  system_prompt: {
    title: "System prompt",
    description: "Instructions for the agent's role, rules, and output format. Be explicit about what good output should look like.",
    learnMoreUrl: url("agent", "system-prompt"),
  },
  requires_approval: {
    title: "Requires human approval",
    description: "Pauses the run before this agent executes until a human approves it. Use this for sensitive or high-impact AI steps.",
    learnMoreUrl: url("agent", "requires-approval"),
  },
  approval_timeout_hours: {
    title: "Approval timeout",
    description: "How long the run waits for approval before the step fails. Shorter timeouts are useful for urgent workflows.",
    learnMoreUrl: url("agent", "approval-timeout"),
  },
  "retry.max_attempts": {
    title: "Max attempts",
    description: "Total attempts for this node, including the first try. Use retries for temporary provider or network failures.",
    learnMoreUrl: url("agent", "max-attempts"),
  },
  "retry.backoff": {
    title: "Backoff strategy",
    description: "How waiting time grows between retry attempts. Exponential is usually best for rate limits and temporary outages.",
    learnMoreUrl: url("agent", "backoff-strategy"),
  },
  "retry.backoff_base_seconds": {
    title: "Backoff base seconds",
    description: "The starting delay before retrying. Linear backoff adds this value; exponential backoff grows from it.",
    learnMoreUrl: url("agent", "backoff-base-seconds"),
  },
  "retry.fail_program_on_exhaust": {
    title: "Fail program when retries are exhausted",
    description: "When enabled, the whole program fails if retries run out. Disable it only when later nodes can safely continue.",
    learnMoreUrl: url("agent", "fail-on-exhaust"),
  },
};

const TRIGGER: Record<string, FieldHelpEntry> = {
  trigger_type: {
    title: "Trigger type",
    description: "What starts this workflow: manual run, schedule, webhook, internal event, another program, or local file activity.",
    learnMoreUrl: url("trigger", "trigger-type"),
  },
  expression: {
    title: "Cron expression",
    description: "A five-part schedule: minute, hour, day of month, month, day of week. For example, 0 9 * * 1-5 runs weekdays at 09:00.",
    learnMoreUrl: url("trigger", "cron-expression"),
    externalUrl: "https://en.wikipedia.org/wiki/Cron",
    externalLabel: "Cron reference",
  },
  timezone: {
    title: "Timezone",
    description: "The IANA timezone used to evaluate the schedule, such as Europe/Vienna or America/New_York.",
    learnMoreUrl: url("trigger", "timezone"),
    externalUrl: "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones",
    externalLabel: "IANA timezone list",
  },
  method: {
    title: "HTTP method",
    description: "The HTTP verb accepted by the webhook trigger. Most providers send webhooks as POST requests.",
    learnMoreUrl: url("trigger", "http-method"),
  },
  source: {
    title: "Source",
    description: "The system that emits the event, such as gmail, slack, or another internal source name.",
    learnMoreUrl: url("trigger", "event-source"),
  },
  event: {
    title: "Event name",
    description: "The exact event to listen for. Only matching events start this workflow.",
    learnMoreUrl: url("trigger", "event-name"),
  },
  source_program_id: {
    title: "Source program ID",
    description: "The Corelyx program UUID whose run completion should trigger this workflow. You can find it in the program URL.",
    learnMoreUrl: url("trigger", "source-program-id"),
  },
  on_status: {
    title: "Fire on status",
    description: "Which source program result statuses should start this workflow.",
    learnMoreUrl: url("trigger", "fire-on-status"),
  },
  device_id: {
    title: "Device",
    description: "The paired desktop device that watches local files. Default uses the most recently active paired device.",
    learnMoreUrl: url("trigger", "device"),
  },
  path: {
    title: "Folder to watch",
    description: "The local folder path to watch on the paired desktop device. The folder must be granted in Corelyx Desktop.",
    learnMoreUrl: url("trigger", "folder-to-watch"),
  },
  events: {
    title: "Fire on",
    description: "Which file changes should start the workflow: created, modified, deleted, or a combination.",
    learnMoreUrl: url("trigger", "fire-on"),
  },
  patterns: {
    title: "Name patterns",
    description: "Optional comma-separated file globs, such as *.pdf or invoice-*.csv. Empty means any file name.",
    learnMoreUrl: url("trigger", "name-patterns"),
  },
};

const STEP: Record<string, FieldHelpEntry> = {
  logic_type: {
    title: "Operation",
    description: "The data or control operation this step performs: transform, filter, branch, loop, delay, format, parse, deduplicate, or sort.",
    learnMoreUrl: url("step", "operation"),
  },
  transformation: {
    title: "Expression",
    description: "A JavaScript expression that receives upstream data as input and returns the transformed value.",
    learnMoreUrl: url("step", "expression"),
  },
  condition: {
    title: "Condition",
    description: "A JavaScript expression. Truthy values continue the run; falsy values stop this path.",
    learnMoreUrl: url("step", "condition"),
  },
  conditions: {
    title: "Conditions",
    description: "Ordered branch rules. The first condition that evaluates true routes the run to its target node.",
    learnMoreUrl: url("step", "conditions"),
  },
  "conditions[].condition": {
    title: "Condition expression",
    description: "A JavaScript expression for this branch. When it is truthy, the run follows the configured target node.",
    learnMoreUrl: url("step", "condition-expression"),
  },
  "conditions[].target_node_id": {
    title: "Target node ID",
    description: "The node to run when this condition is true. Select a node to see its ID in the sidebar.",
    learnMoreUrl: url("step", "target-node-id"),
  },
  default_branch: {
    title: "Default branch",
    description: "The node to run if no branch condition matches. Leave empty to stop this path when nothing matches.",
    learnMoreUrl: url("step", "default-branch"),
  },
  seconds: {
    title: "Delay seconds",
    description: "How long this step waits before continuing. Use short delays to avoid blocking runs for too long.",
    learnMoreUrl: url("step", "delay-seconds"),
  },
  over: {
    title: "Iterate over",
    description: "An expression that resolves to an array, such as input.items. The loop runs once for each item.",
    learnMoreUrl: url("step", "iterate-over"),
  },
  item_var: {
    title: "Item variable name",
    description: "The name downstream nodes use for the current loop item.",
    learnMoreUrl: url("step", "item-variable-name"),
  },
  template: {
    title: "Template",
    description: "A string template using field placeholders such as {name}. Corelyx fills placeholders from input data.",
    learnMoreUrl: url("step", "template"),
  },
  output_key: {
    title: "Output key",
    description: "The output field name where the formatted value is stored for downstream nodes.",
    learnMoreUrl: url("step", "output-key"),
  },
  input_key: {
    title: "Input key",
    description: "The upstream output field that contains the text to parse.",
    learnMoreUrl: url("step", "input-key"),
  },
  format: {
    title: "Format",
    description: "How Corelyx parses the input text: JSON object, CSV rows, or plain lines.",
    learnMoreUrl: url("step", "format"),
  },
  "dedup.key": {
    title: "Key field",
    description: "The field used to identify duplicate items. Items with the same key value collapse to one result.",
    learnMoreUrl: url("step", "key-field"),
  },
  "sort.key": {
    title: "Sort by field",
    description: "The field used to order input items.",
    learnMoreUrl: url("step", "sort-by-field"),
  },
  order: {
    title: "Order",
    description: "Sort direction: ascending or descending.",
    learnMoreUrl: url("step", "order"),
  },
};

const FILE_CONN: Record<string, FieldHelpEntry> = {
  operation: {
    title: "Operation",
    description: "The local filesystem action to run on the paired desktop device.",
    learnMoreUrl: url("connection-file", "operation"),
  },
  "operation_params.path": {
    title: "Path",
    description: "A local file or folder path inside a folder granted to Corelyx Desktop.",
    learnMoreUrl: url("connection-file", "path"),
  },
  "operation_params.content": {
    title: "Content",
    description: "Text to write or append. You can insert upstream values with {{node_id.field}}.",
    learnMoreUrl: url("connection-file", "content"),
  },
  "operation_params.dest": {
    title: "Destination path",
    description: "The target local path for move or copy. It must also be inside a granted folder.",
    learnMoreUrl: url("connection-file", "destination-path"),
  },
  "operation_params.pattern": {
    title: "Search for",
    description: "A file-name substring to search for under the selected folder.",
    learnMoreUrl: url("connection-file", "search-for"),
  },
  conn_scope_access: {
    title: "Scope access",
    description: "The local file permission level. Write operations need write or read/write access.",
    learnMoreUrl: url("connection-file", "scope-access"),
  },
};

const OAUTH_CONN: Record<string, FieldHelpEntry> = {
  connection: {
    title: "Connection",
    description: "The linked account used for this connector operation.",
    learnMoreUrl: url("connection-oauth", "connection"),
  },
  conn_operation: {
    title: "Operation",
    description: "The provider action to execute, such as sending an email, reading a document, or creating a task.",
    learnMoreUrl: url("connection-oauth", "operation"),
  },
  conn_scope_access: {
    title: "Scope access",
    description: "The permission level this connector node may use for the selected account.",
    learnMoreUrl: url("connection-oauth", "scope-access"),
  },
  scope_required: {
    title: "Required scopes",
    description: "OAuth scopes Corelyx expects for the selected operation. These are usually filled automatically from the operation catalog.",
    learnMoreUrl: url("connection-oauth", "required-scopes"),
  },
  operation_params_json: {
    title: "Operation params JSON",
    description: "Raw JSON parameters for an operation that does not have a structured form yet.",
    learnMoreUrl: url("connection-oauth", "operation-params-json"),
  },
};

const HTTP_CONN: Record<string, FieldHelpEntry> = {
  http_method: {
    title: "Method",
    description: "The HTTP verb for the request. GET reads, POST creates, PUT/PATCH updates, and DELETE removes.",
    learnMoreUrl: url("connection-http", "method"),
  },
  url: {
    title: "URL",
    description: "The full API endpoint URL, including https://.",
    learnMoreUrl: url("connection-http", "url"),
  },
  auth_type: {
    title: "Auth type",
    description: "How Corelyx authenticates the HTTP request: bearer token, basic auth, API key header, API key query, or none.",
    learnMoreUrl: url("connection-http", "auth-type"),
  },
  auth_value: {
    title: "Auth value",
    description: "The credential value for the selected auth type. Keep it secret and avoid placing it in logs or visible outputs.",
    learnMoreUrl: url("connection-http", "auth-value"),
  },
  query_params: {
    title: "Query params",
    description: "Key/value pairs appended to the URL after the question mark.",
    learnMoreUrl: url("connection-http", "query-params"),
  },
  headers: {
    title: "Headers",
    description: "HTTP request headers as key/value pairs, such as Content-Type or X-API-Key.",
    learnMoreUrl: url("connection-http", "headers"),
  },
  body: {
    title: "Body",
    description: "The raw request body. For JSON APIs, set a Content-Type header and write valid JSON here.",
    learnMoreUrl: url("connection-http", "body"),
  },
  parse_response: {
    title: "Parse response as JSON",
    description: "When enabled, Corelyx parses the response body into fields that downstream nodes can use.",
    learnMoreUrl: url("connection-http", "parse-response-as-json"),
  },
  timeout_seconds: {
    title: "Timeout seconds",
    description: "How long to wait before failing the HTTP request.",
    learnMoreUrl: url("connection-http", "timeout-seconds"),
  },
  http_retry: {
    title: "Enable retries",
    description: "Retries temporary HTTP failures with the configured retry policy.",
    learnMoreUrl: url("connection-http", "enable-retries"),
  },
};

const RESOURCE_FIELDS: Record<string, FieldHelpEntry> = {
  "docs.document_id": {
    title: "Document ID",
    description: "The ID of a Google Doc. Use the dropdown when connected, or copy the ID from docs.google.com/document/d/<DOCUMENT_ID>/edit.",
    learnMoreUrl: url("resource-ids", "google-docs"),
    externalUrl: "https://developers.google.com/drive/api/guides/about-files",
    externalLabel: "Google Drive file docs",
  },
  "sheets.spreadsheet_id": {
    title: "Spreadsheet ID",
    description: "The ID of a Google Sheet. It appears in docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit.",
    learnMoreUrl: url("resource-ids", "google-sheets"),
    externalUrl: "https://developers.google.com/sheets/api/guides/concepts",
    externalLabel: "Sheets concepts",
  },
  "drive.file_id": {
    title: "File ID",
    description: "The ID of a Google Drive file. It appears in Drive share URLs, often after /d/ or as the id query parameter.",
    learnMoreUrl: url("resource-ids", "google-drive-file"),
    externalUrl: "https://developers.google.com/drive/api/guides/about-files",
    externalLabel: "Drive file docs",
  },
  "drive.parent_id": {
    title: "Parent folder ID",
    description: "The Google Drive folder ID to create or upload into. It appears after /folders/ in the folder URL.",
    learnMoreUrl: url("resource-ids", "google-drive-folder"),
    externalUrl: "https://developers.google.com/drive/api/guides/about-files",
    externalLabel: "Drive file docs",
  },
  "drive.folder_id": {
    title: "Folder ID",
    description: "The Google Drive folder ID. Open the folder and copy the value after /folders/ in the URL.",
    learnMoreUrl: url("resource-ids", "google-drive-folder"),
    externalUrl: "https://developers.google.com/drive/api/guides/about-files",
    externalLabel: "Drive file docs",
  },
  "calendar.calendar_id": {
    title: "Calendar ID",
    description: "The Google Calendar ID. Primary calendars often use the account email; shared calendars have longer IDs.",
    learnMoreUrl: url("resource-ids", "google-calendar"),
    externalUrl: "https://support.google.com/calendar/answer/6225189",
    externalLabel: "Calendar ID help",
  },
  "notion.database_id": {
    title: "Database ID",
    description: "The Notion database ID. It is the long identifier in the database URL.",
    learnMoreUrl: url("resource-ids", "notion-database"),
    externalUrl: "https://developers.notion.com/reference/database",
    externalLabel: "Notion databases",
  },
  "notion.page_id": {
    title: "Page ID",
    description: "The Notion page ID. It is the long identifier in the page URL.",
    learnMoreUrl: url("resource-ids", "notion-page"),
    externalUrl: "https://developers.notion.com/reference/page",
    externalLabel: "Notion pages",
  },
  "notion.parent_id": {
    title: "Parent page or database ID",
    description: "The Notion page or database where the new page should be created.",
    learnMoreUrl: url("resource-ids", "notion-parent"),
    externalUrl: "https://developers.notion.com/reference/post-page",
    externalLabel: "Create Notion page",
  },
  "notion.parent_page_id": {
    title: "Parent page ID",
    description: "The Notion page that will contain the new database.",
    learnMoreUrl: url("resource-ids", "notion-parent"),
    externalUrl: "https://developers.notion.com/reference/post-database",
    externalLabel: "Create Notion database",
  },
  "airtable.base_id": {
    title: "Base ID",
    description: "The Airtable base ID, usually starting with app. The picker lists bases when the connection allows it.",
    learnMoreUrl: url("resource-ids", "airtable-base"),
    externalUrl: "https://airtable.com/developers/web/api/introduction",
    externalLabel: "Airtable API docs",
  },
  "airtable.table_name": {
    title: "Table name",
    description: "The Airtable table name inside the selected base. The picker lists tables after a base is selected.",
    learnMoreUrl: url("resource-ids", "airtable-table"),
    externalUrl: "https://airtable.com/developers/web/api/introduction",
    externalLabel: "Airtable API docs",
  },
  "slack.channel": {
    title: "Channel",
    description: "The Slack channel ID or name. The picker lists channels visible to the connected Slack account.",
    learnMoreUrl: url("resource-ids", "slack-channel"),
    externalUrl: "https://api.slack.com/reference/conversations",
    externalLabel: "Slack conversations",
  },
  "github.repo": {
    title: "Repository",
    description: "The GitHub repository in owner/repo format. The picker lists repositories the connected account can access.",
    learnMoreUrl: url("resource-ids", "github-repo"),
    externalUrl: "https://docs.github.com/en/rest/repos/repos",
    externalLabel: "GitHub repos API",
  },
  "hubspot.contact_id": {
    title: "Contact ID",
    description: "The HubSpot contact ID. The picker lists contacts when the connected account has CRM contact access.",
    learnMoreUrl: url("resource-ids", "hubspot-contact"),
    externalUrl: "https://developers.hubspot.com/docs/api/crm/contacts",
    externalLabel: "HubSpot contacts",
  },
  "hubspot.deal_id": {
    title: "Deal ID",
    description: "The HubSpot deal ID. The picker lists deals when the connected account has CRM deal access.",
    learnMoreUrl: url("resource-ids", "hubspot-deal"),
    externalUrl: "https://developers.hubspot.com/docs/api/crm/deals",
    externalLabel: "HubSpot deals",
  },
  "typeform.form_id": {
    title: "Form ID",
    description: "The Typeform form ID. It appears in form URLs such as typeform.com/to/<FORM_ID>.",
    learnMoreUrl: url("resource-ids", "typeform-form"),
    externalUrl: "https://www.typeform.com/developers/get-started/",
    externalLabel: "Typeform API",
  },
  "asana.workspace_id": {
    title: "Workspace GID",
    description: "The Asana workspace GID. The picker lists workspaces visible to the connected account.",
    learnMoreUrl: url("resource-ids", "asana-workspace"),
    externalUrl: "https://developers.asana.com/docs/asana-gids",
    externalLabel: "Asana GIDs",
  },
  "asana.project_id": {
    title: "Project GID",
    description: "The Asana project GID. The picker lists projects after a workspace is available.",
    learnMoreUrl: url("resource-ids", "asana-project"),
    externalUrl: "https://developers.asana.com/docs/get-a-project",
    externalLabel: "Asana projects",
  },
  "outlook.folder": {
    title: "Folder",
    description: "The Outlook mail folder. The picker lists folders from the connected mailbox.",
    learnMoreUrl: url("resource-ids", "outlook-folder"),
    externalUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mailfolder",
    externalLabel: "Microsoft Graph folders",
  },
  "outlook.destination_folder": {
    title: "Destination folder",
    description: "The Outlook folder to move a message into. The picker lists folders from the connected mailbox.",
    learnMoreUrl: url("resource-ids", "outlook-destination-folder"),
    externalUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mailfolder",
    externalLabel: "Microsoft Graph folders",
  },
};

const OPERATION_SPECIFIC: Record<string, FieldHelpEntry> = {
  "gmail.query": {
    title: "Gmail search query",
    description: "Gmail search syntax, such as from:person@example.com is:unread newer_than:7d.",
    learnMoreUrl: url("operation-params", "query"),
    externalUrl: "https://support.google.com/mail/answer/7190",
    externalLabel: "Gmail search operators",
  },
  "gmail.message_id": {
    title: "Message ID",
    description: "The Gmail message ID. Use a list, search, or trigger output to get this value.",
    learnMoreUrl: url("operation-params", "message-id"),
  },
  "gmail.attachment_id": {
    title: "Attachment ID",
    description: "The Gmail attachment ID from a message payload. Use read_email or get_attachment output to find it.",
    learnMoreUrl: url("operation-params", "attachment-id"),
  },
  "gmail.label_ids": {
    title: "Label IDs",
    description: "Gmail system labels like INBOX and UNREAD, or custom label IDs returned by Gmail.",
    learnMoreUrl: url("operation-params", "label-ids"),
  },
  "gmail.add_label_ids": {
    title: "Add labels",
    description: "Gmail label IDs to add to the message. Separate multiple labels with commas.",
    learnMoreUrl: url("operation-params", "add-labels"),
  },
  "gmail.remove_label_ids": {
    title: "Remove labels",
    description: "Gmail label IDs to remove from the message. Separate multiple labels with commas.",
    learnMoreUrl: url("operation-params", "remove-labels"),
  },
  "calendar.event_id": {
    title: "Event ID",
    description: "The Google Calendar event ID. Use list_events or get_event output to get it.",
    learnMoreUrl: url("operation-params", "event-id"),
    externalUrl: "https://developers.google.com/calendar/api/v3/reference/events",
    externalLabel: "Calendar events API",
  },
  "github.pr_number": {
    title: "PR number",
    description: "The pull request number from the repository URL or pull request list.",
    learnMoreUrl: url("operation-params", "pr-number"),
    externalUrl: "https://docs.github.com/en/rest/pulls/pulls",
    externalLabel: "GitHub pulls API",
  },
  "github.issue_number": {
    title: "Issue number",
    description: "The issue number from the issue URL or repository issue list.",
    learnMoreUrl: url("operation-params", "issue-number"),
    externalUrl: "https://docs.github.com/en/issues/tracking-your-work-with-issues/quickstart",
    externalLabel: "GitHub issues help",
  },
  "hubspot.dealstage": {
    title: "Deal stage",
    description: "The internal HubSpot deal stage value. You can find valid stage IDs in HubSpot pipeline settings.",
    learnMoreUrl: url("operation-params", "dealstage"),
    externalUrl: "https://developers.hubspot.com/docs/api/crm/pipelines",
    externalLabel: "HubSpot pipelines",
  },
  "hubspot.pipeline": {
    title: "Pipeline",
    description: "The internal HubSpot pipeline ID. You can find valid IDs in HubSpot pipeline settings or the pipelines API.",
    learnMoreUrl: url("operation-params", "pipeline"),
    externalUrl: "https://developers.hubspot.com/docs/api/crm/pipelines",
    externalLabel: "HubSpot pipelines",
  },
  "asana.task_id": {
    title: "Task GID",
    description: "The Asana task GID. Use a task list/search result or copy it from the task URL.",
    learnMoreUrl: url("operation-params", "task-id"),
    externalUrl: "https://developers.asana.com/docs/asana-gids",
    externalLabel: "Asana GIDs",
  },
  "thunderbird.uid": {
    title: "Message UID",
    description: "The IMAP message UID returned by a Thunderbird list or search operation.",
    learnMoreUrl: url("operation-params", "message-uid"),
  },
};

const GENERIC_OP_PARAMS: Record<string, FieldHelpEntry> = {
  to: {
    title: "To",
    description: "Recipient email address. For multiple recipients, separate addresses with commas.",
    learnMoreUrl: url("operation-params", "to"),
  },
  subject: {
    title: "Subject",
    description: "The email subject line.",
    learnMoreUrl: url("operation-params", "subject"),
  },
  body: {
    title: "Body",
    description: "Main message or request body content.",
    learnMoreUrl: url("operation-params", "body"),
  },
  cc: {
    title: "CC",
    description: "Carbon-copy email recipients. Separate multiple addresses with commas.",
    learnMoreUrl: url("operation-params", "cc"),
  },
  bcc: {
    title: "BCC",
    description: "Blind-copy email recipients. Other recipients cannot see these addresses.",
    learnMoreUrl: url("operation-params", "bcc"),
  },
  is_html: {
    title: "HTML body",
    description: "Send the body as HTML instead of plain text.",
    learnMoreUrl: url("operation-params", "html-body"),
  },
  html: {
    title: "HTML body",
    description: "Optional HTML alternative for an email message.",
    learnMoreUrl: url("operation-params", "html-body"),
  },
  max_results: {
    title: "Max results",
    description: "Maximum number of items to return. Higher values may take longer or use more API quota.",
    learnMoreUrl: url("operation-params", "max-results"),
  },
  max_records: {
    title: "Max records",
    description: "Maximum number of records to return from the provider.",
    learnMoreUrl: url("operation-params", "max-records"),
  },
  limit: {
    title: "Limit",
    description: "Maximum number of items to return.",
    learnMoreUrl: url("operation-params", "limit"),
  },
  page: {
    title: "Page",
    description: "Page number for paginated API results.",
    learnMoreUrl: url("operation-params", "page"),
  },
  page_size: {
    title: "Page size",
    description: "Number of items to request per page from a paginated API.",
    learnMoreUrl: url("operation-params", "page-size"),
  },
  after: {
    title: "After cursor",
    description: "Pagination cursor returned by a previous response. Leave empty for the first page.",
    learnMoreUrl: url("operation-params", "after-cursor"),
  },
  query: {
    title: "Query",
    description: "Search or filter text for the provider operation.",
    learnMoreUrl: url("operation-params", "query"),
  },
  filter: {
    title: "Filter",
    description: "Provider-specific filter object or expression.",
    learnMoreUrl: url("operation-params", "filter"),
  },
  sorts: {
    title: "Sorts",
    description: "Provider-specific sort definitions, usually as JSON.",
    learnMoreUrl: url("operation-params", "sorts"),
  },
  title: {
    title: "Title",
    description: "The title or name for the created resource.",
    learnMoreUrl: url("operation-params", "title"),
  },
  text: {
    title: "Text",
    description: "Text content to send, append, or search for.",
    learnMoreUrl: url("operation-params", "text"),
  },
  content: {
    title: "Content",
    description: "Content to create, append, upload, or write.",
    learnMoreUrl: url("operation-params", "content"),
  },
  find: {
    title: "Search text",
    description: "The text to find before replacing it.",
    learnMoreUrl: url("operation-params", "search-text"),
  },
  replace: {
    title: "Replacement text",
    description: "The text that replaces each match.",
    learnMoreUrl: url("operation-params", "replacement-text"),
  },
  match_case: {
    title: "Match case",
    description: "When enabled, text matching respects uppercase and lowercase differences.",
    learnMoreUrl: url("operation-params", "match-case"),
  },
  range: {
    title: "Range",
    description: "A Google Sheets A1 notation range, such as Sheet1!A1:D10.",
    learnMoreUrl: url("operation-params", "range"),
    externalUrl: "https://developers.google.com/sheets/api/guides/concepts#a1_notation",
    externalLabel: "Sheets A1 notation",
  },
  values: {
    title: "Values",
    description: "A two-dimensional JSON array of spreadsheet values, where each inner array is a row.",
    learnMoreUrl: url("operation-params", "values"),
  },
  owner: {
    title: "Owner",
    description: "The GitHub user or organization that owns the repository.",
    learnMoreUrl: url("operation-params", "owner"),
  },
  repo: {
    title: "Repository",
    description: "The repository name or owner/repo value, depending on the operation.",
    learnMoreUrl: url("operation-params", "repository"),
  },
  labels: {
    title: "Labels",
    description: "Label names to add, usually separated by commas.",
    learnMoreUrl: url("operation-params", "labels"),
  },
  path: {
    title: "Path",
    description: "A provider-specific file path, local path, or repository path.",
    learnMoreUrl: url("operation-params", "path"),
  },
  message: {
    title: "Message",
    description: "A message or commit message sent to the provider.",
    learnMoreUrl: url("operation-params", "message"),
  },
  branch: {
    title: "Branch",
    description: "The Git branch name to read from or write to.",
    learnMoreUrl: url("operation-params", "branch"),
  },
  blocks: {
    title: "Block Kit blocks",
    description: "Slack Block Kit JSON blocks for richer message layout.",
    learnMoreUrl: url("operation-params", "blocks"),
    externalUrl: "https://api.slack.com/block-kit/building",
    externalLabel: "Slack Block Kit",
  },
  is_private: {
    title: "Private channel",
    description: "Create the Slack channel as private instead of public.",
    learnMoreUrl: url("operation-params", "private-channel"),
  },
  name: {
    title: "Name",
    description: "The name for the created or updated resource.",
    learnMoreUrl: url("operation-params", "name"),
  },
  email: {
    title: "Email",
    description: "An email address used for a recipient, share target, or CRM contact.",
    learnMoreUrl: url("operation-params", "email"),
  },
  role: {
    title: "Role",
    description: "Permission role for the target user, such as reader, commenter, or writer.",
    learnMoreUrl: url("operation-params", "role"),
  },
  fields: {
    title: "Fields",
    description: "JSON field values to set on the created or updated record.",
    learnMoreUrl: url("operation-params", "fields"),
  },
  properties: {
    title: "Properties",
    description: "Provider-specific property values or schema, usually as JSON.",
    learnMoreUrl: url("operation-params", "properties"),
  },
  filter_formula: {
    title: "Filter formula",
    description: "An Airtable formula used to filter matching records.",
    learnMoreUrl: url("operation-params", "filter-formula"),
    externalUrl: "https://support.airtable.com/docs/formula-field-reference",
    externalLabel: "Airtable formulas",
  },
  completed: {
    title: "Completed",
    description: "Whether to include or require completed items.",
    learnMoreUrl: url("operation-params", "completed"),
  },
  since: {
    title: "Since",
    description: "Start date or cursor for filtering newer results.",
    learnMoreUrl: url("operation-params", "since"),
  },
  until: {
    title: "Until",
    description: "End date or cutoff for filtering older results.",
    learnMoreUrl: url("operation-params", "until"),
  },
  start: {
    title: "Start",
    description: "Event start time, usually in ISO 8601 format.",
    learnMoreUrl: url("operation-params", "start"),
  },
  end: {
    title: "End",
    description: "Event end time, usually in ISO 8601 format.",
    learnMoreUrl: url("operation-params", "end"),
  },
  time_min: {
    title: "From",
    description: "Earliest event time to include, usually in ISO 8601 format.",
    learnMoreUrl: url("operation-params", "from"),
  },
  time_max: {
    title: "To",
    description: "Latest event time to include, usually in ISO 8601 format.",
    learnMoreUrl: url("operation-params", "to-time"),
  },
  summary: {
    title: "Title",
    description: "Calendar event title or short summary.",
    learnMoreUrl: url("operation-params", "summary"),
  },
  attendees: {
    title: "Attendees",
    description: "JSON list of attendee objects, usually with email values.",
    learnMoreUrl: url("operation-params", "attendees"),
  },
  description: {
    title: "Description",
    description: "Provider-specific description text for the resource.",
    learnMoreUrl: url("operation-params", "description"),
  },
  mime_type: {
    title: "MIME type",
    description: "The content type of a file, such as application/pdf or text/plain.",
    learnMoreUrl: url("operation-params", "mime-type"),
    externalUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types",
    externalLabel: "MIME type reference",
  },
  content_base64: {
    title: "Content (base64)",
    description: "File content encoded as base64 before upload.",
    learnMoreUrl: url("operation-params", "content-base64"),
  },
  body_type: {
    title: "Body type",
    description: "Email body format, usually Text or HTML.",
    learnMoreUrl: url("operation-params", "body-type"),
  },
  state: {
    title: "State",
    description: "Provider-specific status filter, such as open, closed, or all.",
    learnMoreUrl: url("operation-params", "state"),
  },
  types: {
    title: "Types",
    description: "Provider-specific resource types to include.",
    learnMoreUrl: url("operation-params", "types"),
  },
  from: {
    title: "From contains",
    description: "Sender filter text, usually an email address or partial address.",
    learnMoreUrl: url("operation-params", "from-contains"),
  },
  folder: {
    title: "Folder",
    description: "Mailbox or provider folder to read from.",
    learnMoreUrl: url("operation-params", "folder"),
  },
  dest: {
    title: "Destination folder",
    description: "Destination folder for moving or archiving an item.",
    learnMoreUrl: url("operation-params", "destination-folder"),
  },
  permanent: {
    title: "Delete permanently",
    description: "When enabled, the operation skips the trash or reversible delete path.",
    learnMoreUrl: url("operation-params", "delete-permanently"),
  },
  unflag: {
    title: "Remove flag",
    description: "When enabled, removes the flag/star instead of adding it.",
    learnMoreUrl: url("operation-params", "remove-flag"),
  },
  unseen_only: {
    title: "Unread only",
    description: "Only include unread messages.",
    learnMoreUrl: url("operation-params", "unread-only"),
  },
};

const ALL: Record<string, FieldHelpEntry> = {
  ...IDENTITY,
  ...AGENT,
  ...TRIGGER,
  ...STEP,
  ...FILE_CONN,
  ...OAUTH_CONN,
  ...HTTP_CONN,
};

function toTitle(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fallbackOperationHelp(
  provider: string,
  operation: string,
  field: OperationFieldHelpContext,
): FieldHelpEntry {
  const title = field.label || toTitle(field.key);
  const hint = field.hint ? `${field.hint} ` : "";
  const type = field.type ? `This is a ${field.type} field. ` : "";

  return {
    title,
    description: `${hint}${type}Set this value for the ${provider}.${operation} operation. Use an upstream reference like {{node_id.field}} when the value should come from an earlier node.`,
    learnMoreUrl: url("operation-params", "other-connector-fields"),
  };
}

export function getFieldHelp(key: string): FieldHelpEntry | null {
  return ALL[key] ?? null;
}

export function getOperationFieldHelp(
  provider: string,
  operation: string,
  field: OperationFieldHelpContext,
): FieldHelpEntry {
  return (
    OPERATION_SPECIFIC[`${provider}.${operation}.${field.key}`] ??
    OPERATION_SPECIFIC[`${provider}.${field.key}`] ??
    RESOURCE_FIELDS[`${provider}.${field.key}`] ??
    GENERIC_OP_PARAMS[field.key] ??
    fallbackOperationHelp(provider, operation, field)
  );
}

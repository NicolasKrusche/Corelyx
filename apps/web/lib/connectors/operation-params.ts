// Shared catalog of structured param fields for each provider+operation.
// Consumed by the NodeSidebar (for rendering form inputs) and the validation
// layer (for detecting missing or sentinel values on required params).

export type ParamFieldType = "string" | "text" | "number" | "boolean" | "json" | "array";

export interface ParamField {
  key: string;
  label: string;
  type: ParamFieldType;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

export const OPERATION_PARAM_FIELDS: Record<string, Record<string, ParamField[]>> = {
  gmail: {
    list_emails: [
      { key: "query", label: "Query", type: "string", placeholder: "from:user@example.com is:unread" },
      { key: "max_results", label: "Max results", type: "number", placeholder: "10" },
      { key: "label_ids", label: "Label IDs", type: "array", placeholder: "INBOX, UNREAD" },
    ],
    list_threads: [
      { key: "query", label: "Query", type: "string", placeholder: "subject:invoice" },
      { key: "max_results", label: "Max results", type: "number", placeholder: "10" },
    ],
    search: [
      { key: "query", label: "Search query", type: "string", placeholder: "has:attachment newer_than:7d", required: true },
      { key: "max_results", label: "Max results", type: "number", placeholder: "20" },
    ],
    read_email: [
      { key: "message_id", label: "Message ID", type: "string", placeholder: "18e3f1a2b3c4d5e6", required: true },
    ],
    get_attachment: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
      { key: "attachment_id", label: "Attachment ID", type: "string", required: true },
    ],
    send_email: [
      { key: "to", label: "To", type: "string", placeholder: "alice@example.com", required: true },
      { key: "subject", label: "Subject", type: "string", required: true },
      { key: "body", label: "Body", type: "text", required: true },
      { key: "cc", label: "CC", type: "string", placeholder: "bob@example.com" },
      { key: "bcc", label: "BCC", type: "string" },
      { key: "is_html", label: "HTML body", type: "boolean" },
    ],
    archive_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
    ],
    label_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
      { key: "add_label_ids", label: "Add labels", type: "array", placeholder: "STARRED, Label_123" },
      { key: "remove_label_ids", label: "Remove labels", type: "array", placeholder: "UNREAD" },
    ],
    delete_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
    ],
  },
  notion: {
    read_page: [
      { key: "page_id", label: "Page ID", type: "string", placeholder: "a1b2c3d4-...", required: true },
    ],
    create_page: [
      { key: "parent_id", label: "Parent page/DB ID", type: "string", required: true },
      { key: "title", label: "Title", type: "string", required: true },
      { key: "content", label: "Initial content (Markdown)", type: "text" },
    ],
    append_to_page: [
      { key: "page_id", label: "Page ID", type: "string", required: true },
      { key: "content", label: "Content (Markdown)", type: "text", required: true },
    ],
    query_database: [
      { key: "database_id", label: "Database ID", type: "string", required: true },
      { key: "filter", label: "Filter", type: "json", hint: "Notion filter object" },
      { key: "sorts", label: "Sorts", type: "json", hint: "Array of sort objects" },
      { key: "page_size", label: "Page size", type: "number", placeholder: "100" },
    ],
    create_database_entry: [
      { key: "database_id", label: "Database ID", type: "string", required: true },
      { key: "_title", label: "Title", type: "string" },
      { key: "_body", label: "Body", type: "text" },
      { key: "properties", label: "Properties", type: "json", hint: "Optional Notion properties object" },
    ],
    create_database: [
      { key: "parent_page_id", label: "Parent page ID", type: "string", required: true },
      { key: "title", label: "Database title", type: "string" },
      { key: "properties", label: "Properties", type: "json", hint: "Optional Notion property schema" },
    ],
  },
  slack: {
    send_message: [
      { key: "channel", label: "Channel", type: "string", placeholder: "#general or C123ABC", required: true },
      { key: "text", label: "Message text", type: "text", required: true },
      { key: "blocks", label: "Block Kit blocks", type: "json", hint: "Optional rich layout blocks" },
    ],
    read_channel: [
      { key: "channel", label: "Channel ID", type: "string", required: true },
      { key: "limit", label: "Message limit", type: "number", placeholder: "50" },
    ],
    list_channels: [
      { key: "types", label: "Types", type: "string", placeholder: "public_channel,private_channel" },
      { key: "limit", label: "Limit", type: "number", placeholder: "100" },
    ],
    create_channel: [
      { key: "name", label: "Channel name", type: "string", placeholder: "my-channel", required: true },
      { key: "is_private", label: "Private channel", type: "boolean" },
    ],
  },
  github: {
    create_issue: [
      { key: "owner", label: "Owner", type: "string", placeholder: "octocat", required: true },
      { key: "repo", label: "Repository", type: "string", placeholder: "my-repo", required: true },
      { key: "title", label: "Title", type: "string", required: true },
      { key: "body", label: "Body", type: "text" },
      { key: "labels", label: "Labels", type: "array", placeholder: "bug, enhancement" },
    ],
    comment_on_issue: [
      { key: "owner", label: "Owner", type: "string", required: true },
      { key: "repo", label: "Repository", type: "string", required: true },
      { key: "issue_number", label: "Issue number", type: "number", required: true },
      { key: "body", label: "Comment body", type: "text", required: true },
    ],
    list_prs: [
      { key: "owner", label: "Owner", type: "string", required: true },
      { key: "repo", label: "Repository", type: "string", required: true },
      { key: "state", label: "State", type: "string", placeholder: "open" },
    ],
    get_pr_diff: [
      { key: "owner", label: "Owner", type: "string", required: true },
      { key: "repo", label: "Repository", type: "string", required: true },
      { key: "pr_number", label: "PR number", type: "number", required: true },
    ],
    push_file: [
      { key: "owner", label: "Owner", type: "string", required: true },
      { key: "repo", label: "Repository", type: "string", required: true },
      { key: "path", label: "File path", type: "string", placeholder: "src/hello.txt", required: true },
      { key: "content", label: "File content", type: "text", required: true },
      { key: "message", label: "Commit message", type: "string", required: true },
      { key: "branch", label: "Branch", type: "string", placeholder: "main" },
    ],
  },
  sheets: {
    read_range: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
      { key: "range", label: "Range", type: "string", placeholder: "Sheet1!A1:D100", required: true },
    ],
    write_range: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
      { key: "range", label: "Range", type: "string", placeholder: "Sheet1!A1", required: true },
      { key: "values", label: "Values (2D array)", type: "json", required: true, hint: '[["a","b"],["c","d"]]' },
    ],
    append_row: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
      { key: "range", label: "Range / sheet name", type: "string", placeholder: "Sheet1", required: true },
      { key: "values", label: "Row values", type: "json", required: true, hint: '[["val1","val2"]]' },
    ],
    list_sheets: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
    ],
    create_sheet: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
      { key: "title", label: "Sheet title", type: "string", required: true },
    ],
    clear_range: [
      { key: "spreadsheet_id", label: "Spreadsheet", type: "string", required: true },
      { key: "range", label: "Range", type: "string", placeholder: "Sheet1!A1:Z100", required: true },
    ],
  },
  calendar: {
    list_events: [
      { key: "calendar_id", label: "Calendar ID", type: "string", placeholder: "primary" },
      { key: "time_min", label: "From (ISO 8601)", type: "string", placeholder: "2024-01-01T00:00:00Z" },
      { key: "time_max", label: "To (ISO 8601)", type: "string" },
      { key: "max_results", label: "Max results", type: "number", placeholder: "10" },
    ],
    get_event: [
      { key: "event_id", label: "Event ID", type: "string", required: true },
      { key: "calendar_id", label: "Calendar ID", type: "string", placeholder: "primary" },
    ],
    create_event: [
      { key: "calendar_id", label: "Calendar ID", type: "string", placeholder: "primary" },
      { key: "summary", label: "Title", type: "string", required: true },
      { key: "start", label: "Start (ISO 8601)", type: "string", required: true },
      { key: "end", label: "End (ISO 8601)", type: "string", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "attendees", label: "Attendees", type: "json", hint: '[{"email":"a@b.com"}]' },
    ],
    update_event: [
      { key: "calendar_id", label: "Calendar ID", type: "string", placeholder: "primary" },
      { key: "event_id", label: "Event ID", type: "string", required: true },
      { key: "summary", label: "Title", type: "string" },
      { key: "start", label: "Start (ISO 8601)", type: "string" },
      { key: "end", label: "End (ISO 8601)", type: "string" },
    ],
    delete_event: [
      { key: "calendar_id", label: "Calendar ID", type: "string", placeholder: "primary" },
      { key: "event_id", label: "Event ID", type: "string", required: true },
    ],
  },
  docs: {
    read_document: [
      { key: "document_id", label: "Document ID", type: "string", required: true },
    ],
    create_document: [
      { key: "title", label: "Title", type: "string", required: true },
      { key: "content", label: "Initial content", type: "text" },
    ],
    append_to_document: [
      { key: "document_id", label: "Document ID", type: "string", required: true },
      { key: "text", label: "Content to append", type: "text", required: true },
    ],
    append_text: [
      { key: "document_id", label: "Document ID", type: "string", required: true },
      { key: "text", label: "Content to append", type: "text", required: true },
    ],
    replace_text: [
      { key: "document_id", label: "Document ID", type: "string", required: true },
      { key: "find", label: "Search text", type: "string", required: true },
      { key: "replace", label: "Replacement text", type: "string" },
      { key: "match_case", label: "Match case", type: "boolean" },
    ],
  },
  drive: {
    list_files: [
      { key: "query", label: "Query", type: "string", placeholder: "name contains 'report' and trashed=false" },
      { key: "folder_id", label: "Folder ID", type: "string" },
      { key: "mime_type", label: "MIME type", type: "string", placeholder: "application/pdf" },
      { key: "max_results", label: "Max results", type: "number", placeholder: "20" },
    ],
    get_file: [
      { key: "file_id", label: "File ID", type: "string", required: true },
    ],
    get_file_metadata: [
      { key: "file_id", label: "File ID", type: "string", required: true },
    ],
    upload_file: [
      { key: "name", label: "File name", type: "string", required: true },
      { key: "content_base64", label: "Content (base64)", type: "text", required: true },
      { key: "mime_type", label: "MIME type", type: "string", placeholder: "text/plain" },
      { key: "parent_id", label: "Parent folder ID", type: "string" },
    ],
    create_folder: [
      { key: "name", label: "Folder name", type: "string", required: true },
      { key: "parent_id", label: "Parent folder ID", type: "string" },
    ],
    move_file: [
      { key: "file_id", label: "File ID", type: "string", required: true },
      { key: "folder_id", label: "Destination folder ID", type: "string", required: true },
    ],
    delete_file: [
      { key: "file_id", label: "File ID", type: "string", required: true },
    ],
    share_file: [
      { key: "file_id", label: "File ID", type: "string", required: true },
      { key: "email", label: "Share with (email)", type: "string", required: true },
      { key: "role", label: "Role", type: "string", placeholder: "writer" },
    ],
  },
  airtable: {
    list_records: [
      { key: "base_id", label: "Base ID", type: "string", placeholder: "appXXXXXXXX", required: true },
      { key: "table_name", label: "Table name", type: "string", required: true },
      { key: "filter_formula", label: "Filter formula", type: "string", placeholder: 'NOT({Status}="Done")' },
      { key: "max_records", label: "Max records", type: "number", placeholder: "100" },
    ],
    get_record: [
      { key: "base_id", label: "Base ID", type: "string", required: true },
      { key: "table_name", label: "Table name", type: "string", required: true },
      { key: "record_id", label: "Record ID", type: "string", required: true },
    ],
    create_record: [
      { key: "base_id", label: "Base ID", type: "string", required: true },
      { key: "table_name", label: "Table name", type: "string", required: true },
      { key: "fields", label: "Fields", type: "json", required: true, hint: '{"Name":"Alice","Status":"Active"}' },
    ],
    update_record: [
      { key: "base_id", label: "Base ID", type: "string", required: true },
      { key: "table_name", label: "Table name", type: "string", required: true },
      { key: "record_id", label: "Record ID", type: "string", required: true },
      { key: "fields", label: "Fields to update", type: "json", required: true },
    ],
    delete_record: [
      { key: "base_id", label: "Base ID", type: "string", required: true },
      { key: "table_name", label: "Table name", type: "string", required: true },
      { key: "record_id", label: "Record ID", type: "string", required: true },
    ],
  },
  hubspot: {
    list_contacts: [
      { key: "limit", label: "Limit", type: "number", placeholder: "100" },
      { key: "properties", label: "Properties", type: "array", placeholder: "email, firstname, lastname" },
      { key: "after", label: "After (cursor)", type: "string" },
    ],
    get_contact: [
      { key: "contact_id", label: "Contact ID", type: "string", required: true },
    ],
    create_contact: [
      { key: "email", label: "Email", type: "string", required: true },
      { key: "firstname", label: "First name", type: "string" },
      { key: "lastname", label: "Last name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "company", label: "Company", type: "string" },
    ],
    update_contact: [
      { key: "contact_id", label: "Contact ID", type: "string", required: true },
      { key: "email", label: "Email", type: "string" },
      { key: "firstname", label: "First name", type: "string" },
      { key: "lastname", label: "Last name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "company", label: "Company", type: "string" },
    ],
    list_deals: [
      { key: "limit", label: "Limit", type: "number", placeholder: "100" },
      { key: "after", label: "After (cursor)", type: "string" },
    ],
    create_deal: [
      { key: "deal_name", label: "Deal name", type: "string", required: true },
      { key: "amount", label: "Amount", type: "number" },
      { key: "dealstage", label: "Deal stage", type: "string" },
      { key: "closedate", label: "Close date", type: "string" },
      { key: "pipeline", label: "Pipeline", type: "string" },
    ],
    update_deal: [
      { key: "deal_id", label: "Deal ID", type: "string", required: true },
      { key: "deal_name", label: "Deal name", type: "string" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "dealstage", label: "Deal stage", type: "string" },
      { key: "closedate", label: "Close date", type: "string" },
      { key: "pipeline", label: "Pipeline", type: "string" },
    ],
  },
  typeform: {
    list_forms: [
      { key: "page", label: "Page", type: "number", placeholder: "1" },
      { key: "page_size", label: "Page size", type: "number", placeholder: "10" },
    ],
    get_form: [
      { key: "form_id", label: "Form ID", type: "string", required: true },
    ],
    get_responses: [
      { key: "form_id", label: "Form ID", type: "string", required: true },
      { key: "page_size", label: "Page size", type: "number", placeholder: "25" },
      { key: "since", label: "Since (ISO 8601)", type: "string" },
      { key: "until", label: "Until (ISO 8601)", type: "string" },
      { key: "completed", label: "Completed only", type: "boolean" },
    ],
    list_responses: [
      { key: "form_id", label: "Form ID", type: "string", required: true },
      { key: "page_size", label: "Page size", type: "number", placeholder: "25" },
      { key: "since", label: "Since (ISO 8601)", type: "string" },
      { key: "until", label: "Until (ISO 8601)", type: "string" },
      { key: "completed", label: "Completed only", type: "boolean" },
    ],
  },
  asana: {
    list_tasks: [
      { key: "project_id", label: "Project ID", type: "string", required: true },
      { key: "completed", label: "Completed", type: "boolean" },
      { key: "limit", label: "Limit", type: "number", placeholder: "50" },
    ],
    get_task: [
      { key: "task_id", label: "Task GID", type: "string", required: true },
    ],
    create_task: [
      { key: "project_id", label: "Project ID", type: "string", required: true },
      { key: "name", label: "Task name", type: "string", required: true },
      { key: "notes", label: "Notes", type: "text" },
      { key: "due_on", label: "Due date (YYYY-MM-DD)", type: "string" },
      { key: "assignee", label: "Assignee (email or GID)", type: "string" },
    ],
    update_task: [
      { key: "task_id", label: "Task GID", type: "string", required: true },
      { key: "name", label: "Name", type: "string" },
      { key: "notes", label: "Notes", type: "text" },
      { key: "due_on", label: "Due date (YYYY-MM-DD)", type: "string" },
      { key: "assignee", label: "Assignee (email or GID)", type: "string" },
    ],
    complete_task: [
      { key: "task_id", label: "Task GID", type: "string", required: true },
    ],
    list_projects: [
      { key: "workspace_id", label: "Workspace GID", type: "string" },
      { key: "limit", label: "Limit", type: "number", placeholder: "50" },
    ],
  },
  outlook: {
    list_emails: [
      { key: "folder", label: "Folder", type: "string", placeholder: "Inbox" },
      { key: "max_results", label: "Max messages", type: "number", placeholder: "20" },
      { key: "filter", label: "OData filter", type: "string", placeholder: "isRead eq false" },
    ],
    read_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
    ],
    send_email: [
      { key: "to", label: "To (email)", type: "string", required: true },
      { key: "subject", label: "Subject", type: "string", required: true },
      { key: "body", label: "Body", type: "text", required: true },
      { key: "cc", label: "CC", type: "string" },
      { key: "body_type", label: "Body type", type: "string", placeholder: "Text" },
    ],
    reply_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
      { key: "body", label: "Reply text", type: "text" },
    ],
    delete_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
    ],
    list_folders: [],
    move_email: [
      { key: "message_id", label: "Message ID", type: "string", required: true },
      { key: "destination_folder", label: "Destination folder", type: "string", placeholder: "archive", required: true, hint: 'Folder ID or well-known name: inbox, archive, deleteditems, sentitems' },
    ],
  },
  thunderbird: {
    list_folders: [],
    list_messages: [
      { key: "folder", label: "Folder", type: "string", placeholder: "INBOX", hint: "IMAP folder name (default INBOX)." },
      { key: "limit", label: "Max messages", type: "number", placeholder: "25" },
    ],
    search_messages: [
      { key: "folder", label: "Folder", type: "string", placeholder: "INBOX" },
      { key: "from", label: "From contains", type: "string", placeholder: "boss@company.com" },
      { key: "subject", label: "Subject contains", type: "string", placeholder: "invoice" },
      { key: "text", label: "Body contains", type: "string" },
      { key: "since", label: "Since (DD-Mon-YYYY)", type: "string", placeholder: "01-Jun-2026" },
      { key: "unseen_only", label: "Unread only", type: "boolean" },
      { key: "limit", label: "Max messages", type: "number", placeholder: "25" },
    ],
    get_message: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Folder", type: "string", placeholder: "INBOX" },
    ],
    send_email: [
      { key: "to", label: "To", type: "string", placeholder: "alice@example.com", required: true },
      { key: "subject", label: "Subject", type: "string", required: true },
      { key: "body", label: "Body", type: "text", required: true },
      { key: "cc", label: "CC", type: "string" },
      { key: "bcc", label: "BCC", type: "string" },
      { key: "html", label: "HTML body (optional)", type: "text", hint: "Sent as an HTML alternative." },
    ],
    move_message: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "dest", label: "Destination folder", type: "string", required: true, placeholder: "Projects/Acme", hint: "Exact folder name (use list_folders)." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
    ],
    archive_message: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
      { key: "dest", label: "Archive folder", type: "string", placeholder: "Archive", hint: "Defaults to 'Archive'." },
    ],
    mark_spam: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
      { key: "dest", label: "Junk folder", type: "string", placeholder: "Junk", hint: "Defaults to 'Junk'." },
    ],
    trash_message: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
      { key: "permanent", label: "Delete permanently", type: "boolean", hint: "Off = move to Trash (reversible)." },
    ],
    mark_read: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
    ],
    mark_unread: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
    ],
    flag_message: [
      { key: "uid", label: "Message UID", type: "string", required: true, hint: "From a list/search result." },
      { key: "folder", label: "Source folder", type: "string", placeholder: "INBOX" },
      { key: "unflag", label: "Remove flag", type: "boolean", hint: "Off = add the star/flag." },
    ],
  },
};

// Some operations require at least one of a set of otherwise-optional params.
// gmail.label_email is valid only when it adds and/or removes at least one
// label; with neither, the Gmail modify call is rejected at runtime, so we
// surface it during pre-flight instead. Each group pairs the keys that satisfy
// it with a human-readable description used in validation copy.
export interface ParamAnyOfGroup {
  keys: string[];
  description: string;
}

export const OPERATION_PARAM_ANY_OF: Record<string, Record<string, ParamAnyOfGroup[]>> = {
  gmail: {
    label_email: [
      { keys: ["add_label_ids", "remove_label_ids"], description: "a label to add or remove" },
    ],
  },
};

// Return missing (empty or sentinel-valued) required param keys for a given
// provider+operation combination. Consumers use this to drive UI warnings
// and pre-flight checks.
const SENTINEL = "__USER_ASSIGNED__";

// True when a param holds a real value — not undefined/null, not an empty or
// sentinel-only string, and (for array fields) not an empty array.
function paramHasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some(paramHasValue);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== SENTINEL;
  }
  return true;
}

// Return the descriptions of any "at least one of" param groups that are not
// satisfied for the given provider+operation. Empty array means all satisfied.
export function getUnsatisfiedParamGroups(
  provider: string,
  operation: string,
  params: Record<string, unknown> | undefined | null
): string[] {
  const groups = OPERATION_PARAM_ANY_OF[provider]?.[operation];
  if (!groups) return [];
  const p = params ?? {};
  return groups
    .filter((group) => !group.keys.some((key) => paramHasValue(p[key])))
    .map((group) => group.description);
}

export function getMissingRequiredParams(
  provider: string,
  operation: string,
  params: Record<string, unknown> | undefined | null
): string[] {
  const fields = OPERATION_PARAM_FIELDS[provider]?.[operation];
  if (!fields) return [];
  const p = params ?? {};
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const val = p[field.key];
    if (val === undefined || val === null) {
      missing.push(field.key);
      continue;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "" || trimmed === SENTINEL) missing.push(field.key);
    }
  }
  return missing;
}

export function isUnassignedParamValue(value: unknown): boolean {
  return typeof value === "string" && (value.trim() === "" || value.trim() === SENTINEL);
}

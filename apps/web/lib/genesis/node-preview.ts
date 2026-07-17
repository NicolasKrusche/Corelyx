// Live node output preview — a deterministic, plain-language sketch of the shape
// of data a node emits, shown right on the canvas card. Like the explainer, it's
// a pure function: no LLM, no run required. It answers "what does this node hand
// to the next one?" so the graph reads as a data pipeline instead of a row of
// opaque boxes, and so users know which fields they can reference downstream with
// {{node.field}}.
//
// The shapes mirror the output contracts documented in the Genesis prompt. Where
// an exact operation isn't catalogued, a verb-prefix heuristic gives a sensible
// approximation rather than nothing. Returns null when a node produces no
// meaningful data (e.g. a manual trigger).
//
// Pure and client-safe: imports are type-only.

import type { Node, ConnectionConfig, OAuthConnectionConfig, StepConfig, AgentConfig, TriggerConfig, DataSchema } from "@flowos/schema";

/** The minimal node shape the preview needs — works with a full Node or the
 *  React Flow node's `data` (which lacks id/position). */
export interface PreviewInput {
  type: Node["type"];
  config: unknown;
  connection?: string | null;
}

// ─── Connector operation output shapes ──────────────────────────────────────
// Keyed by provider → operation. Values are compact, human-readable shape
// sketches (not literal JSON). Covers the tier-1 connectors whose outputs the
// Genesis prompt documents; everything else falls back to verb-prefix heuristics.

const OPERATION_OUTPUT: Record<string, Record<string, string>> = {
  gmail: {
    list_emails: "emails: [{ id, threadId }]",
    search: "emails: [{ id, threadId }]",
    read_email: "{ subject, from, to, body, labels }",
    send_email: "{ id, threadId }",
    archive_email: "{ message_id, archived }",
    delete_email: "{ message_id, deleted }",
    label_email: "{ message_id, labels }",
    list_threads: "threads: [{ id, historyId }]",
    get_attachment: "{ data_base64, size_bytes, mime_type }",
  },
  outlook: {
    list_emails: "emails: [{ id, subject, from, is_read }]",
    read_email: "{ subject, from, body, is_read }",
    send_email: "{ sent, subject }",
    reply_email: "{ replied, message_id }",
    list_folders: "folders: [{ id, name, unread_items }]",
    move_email: "{ message_id, moved }",
  },
  slack: {
    send_message: "{ ts, channel }",
    read_channel: "messages: [{ ts, user, text }]",
    list_channels: "channels: [{ id, name }]",
    create_channel: "{ id, name }",
  },
  notion: {
    create_database_entry: "{ id, url }",
    create_page: "{ id, url }",
    create_database: "{ id, url }",
    query_database: "results: [{ id, properties }]",
    read_page: "{ id, title, content, url }",
    append_to_page: "{ id, appended }",
  },
  github: {
    create_issue: "{ number, url }",
    comment_on_issue: "{ id, url }",
    list_prs: "pull_requests: [{ number, title, state }]",
    get_pr_diff: "{ diff, files_changed, additions }",
    push_file: "{ commit_sha, path }",
  },
  sheets: {
    read_range: "values: [[ ...row ]]",
    write_range: "{ updated_cells }",
    append_row: "{ updated_range }",
    list_sheets: "sheets: [{ title, sheet_id }]",
    create_sheet: "{ sheet_id, title }",
    clear_range: "{ cleared_range }",
  },
  airtable: {
    list_records: "records: [{ id, fields }]",
    get_record: "{ id, fields }",
    create_record: "{ record_id, fields }",
    update_record: "{ record_id, fields }",
    delete_record: "{ record_id, deleted }",
  },
  calendar: {
    list_events: "events: [{ id, summary, start, end }]",
    get_event: "{ id, summary, start, end, attendees }",
    create_event: "{ id, html_link, status }",
    update_event: "{ id, status }",
    delete_event: "{ event_id, deleted }",
  },
  drive: {
    list_files: "files: [{ id, name, mimeType }]",
    get_file: "{ id, name, mimeType, webViewLink }",
    upload_file: "{ file_id, name, web_view_link }",
    create_folder: "{ folder_id, name }",
    move_file: "{ file_id, moved }",
    share_file: "{ file_id, permission_id }",
    delete_file: "{ file_id, deleted }",
  },
  docs: {
    read_document: "{ document_id, title, text }",
    create_document: "{ document_id, title }",
    append_text: "{ document_id, appended }",
    replace_text: "{ document_id, occurrences_replaced }",
  },
  hubspot: {
    list_contacts: "contacts: [{ id, email, firstname }]",
    get_contact: "{ id, email, firstname, company }",
    create_contact: "{ id, email }",
    update_contact: "{ id }",
    list_deals: "deals: [{ id, dealname, amount }]",
    create_deal: "{ id, dealname }",
    update_deal: "{ id }",
  },
  asana: {
    list_projects: "projects: [{ gid, name }]",
    list_tasks: "tasks: [{ gid, name, due_on }]",
    get_task: "{ gid, name, assignee, notes }",
    create_task: "{ task_id, name }",
    update_task: "{ task_id, name }",
    complete_task: "{ task_id, completed }",
  },
  typeform: {
    list_forms: "forms: [{ id, title }]",
    get_form: "{ id, title, fields }",
    get_responses: "responses: [{ response_id, answers }]",
  },
};

/** Verb-prefix heuristic for operations not in the catalog above. */
function outputByOperationPrefix(operation: string): string {
  if (/^(list|search|query|get_all|find)/.test(operation)) return "results: [ … ]";
  if (/^(get|read|retrieve|fetch)/.test(operation)) return "{ …record fields }";
  if (/^(send|create|add|append|post|insert|submit)/.test(operation)) return "{ id }";
  if (/^(update|patch|edit|label|move|complete|mark)/.test(operation)) return "{ id, updated: true }";
  if (/^(delete|remove|clear|archive|destroy)/.test(operation)) return "{ deleted: true }";
  return "{ result }";
}

// ─── DataSchema → shape sketch (for agent output_schema) ─────────────────────

function sketchDataSchema(schema: DataSchema | null | undefined): string | null {
  if (!schema) return null;
  if (schema.type === "object" && schema.properties) {
    const keys = Object.keys(schema.properties);
    if (keys.length === 0) return "{ … }";
    const shown = keys.slice(0, 4).join(", ");
    return `{ ${shown}${keys.length > 4 ? ", …" : ""} }`;
  }
  if (schema.type === "array") return "[ … ]";
  return schema.type;
}

// ─── Per-type previews ───────────────────────────────────────────────────────

function previewConnection(config: ConnectionConfig, connection?: string | null): string | null {
  if (config.connector_type === "http") {
    return config.parse_response ? "response body (JSON)" : "raw response text";
  }
  if (config.connector_type === "file") {
    switch (config.operation) {
      case "read": return "{ content, size_bytes }";
      case "list": return "files: [{ name, path, size }]";
      case "search": return "matches: [{ path }]";
      case "stat": return "{ size, modified, is_dir }";
      case "write":
      case "append": return "{ path, written: true }";
      case "move":
      case "copy": return "{ from, to }";
      case "delete": return "{ path, deleted: true }";
      case "mkdir": return "{ path, created: true }";
      default: return "{ result }";
    }
  }

  // OAuth connector.
  const oauth = config as OAuthConnectionConfig;
  const provider = oauth.provider ?? "";
  const operation = oauth.operation;
  if (!operation) return "access token (for later steps)";

  const catalogued = OPERATION_OUTPUT[provider]?.[operation];
  return catalogued ?? outputByOperationPrefix(operation);
}

function previewStep(config: StepConfig): string | null {
  switch (config.logic_type) {
    case "transform":
      return "reshaped data";
    case "filter":
      return "input data (only when the condition passes)";
    case "branch":
      return "the same data, routed to one branch";
    case "loop":
      return `one iteration per item in ${config.over}`;
    case "format":
      return `{ ${config.output_key}: "…" }`;
    case "parse":
      return `parsed ${config.format.toUpperCase()} → data`;
    case "deduplicate":
      return `items: unique by "${config.key}"`;
    case "sort":
      return `items: sorted by "${config.key}" (${config.order})`;
    default:
      return null;
  }
}

function previewTrigger(config: TriggerConfig): string | null {
  switch (config.trigger_type) {
    case "webhook":
      return "request body (JSON)";
    case "event":
      if (config.source === "gmail") return "{ message_id, thread_id }";
      if (config.source === "github") return "{ action, issue, repository }";
      if (config.source === "typeform") return "{ form_id, response_id, answers }";
      return "event payload (JSON)";
    case "file_watch":
      return "{ path, event, device_id }";
    default:
      // manual / cron / program_output carry no meaningful data payload.
      return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * A compact, human-readable sketch of what a node outputs, e.g.
 * "emails: [{ id, threadId }]". Returns null when the node emits no meaningful
 * data (manual/cron triggers, notes, groups). Never throws.
 */
export function previewNodeOutput(input: PreviewInput): string | null {
  switch (input.type) {
    case "connection":
      return previewConnection(input.config as ConnectionConfig, input.connection);
    case "step":
      return previewStep(input.config as StepConfig);
    case "trigger":
      return previewTrigger(input.config as TriggerConfig);
    case "agent": {
      const cfg = input.config as AgentConfig;
      return sketchDataSchema(cfg.output_schema) ?? "AI result (JSON)";
    }
    case "agent_task":
      return "task result + report";
    default:
      // note, group — visual only.
      return null;
  }
}

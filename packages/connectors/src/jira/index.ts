// ─── Jira Connector ─────────────────────────────────────────────────────────
// Jira Cloud connector for issue management, projects, and boards.
// Operations: Issues (CRUD, transitions, comments, attachments), JQL Search, Projects, Boards
// Auth: OAuth2 + API Token fallback
// Features: Webhook support, JQL search

import { z } from "zod";
import { defineConnector } from "@flowos/connector-kit";
import type { OperationContext } from "@flowos/connector-kit";
import { apiRequest, ConnectorError, withRetry } from "../utils.js";

// ─── Schemas ────────────────────────────────────────────────────────────────

const searchIssuesInput = z.object({
  jql: z.string().min(1).describe("JQL query string"),
  max_results: z.number().int().min(1).max(200).default(50).describe("Max results"),
  start_at: z.number().int().min(0).default(0).describe("Offset for pagination"),
  fields: z.array(z.string()).optional().describe("Fields to include (default: summary,status,assignee)"),
  expand: z.array(z.string()).optional().describe("Expand additional data (e.g. changelog, operations)"),
});

const issueSummary = z.object({
  id: z.string().describe("Issue ID"),
  key: z.string().describe("Issue key (e.g. PROJ-123)"),
  self: z.string().optional().describe("Issue URL"),
  summary: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  issue_type: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const searchIssuesOutput = z.object({
  issues: z.array(issueSummary).describe("Matching issues"),
  total: z.number().describe("Total matching issues"),
  start_at: z.number().describe("Current offset"),
  max_results: z.number().describe("Max results per page"),
  is_last: z.boolean().describe("Whether this is the last page"),
});

const getIssueInput = z.object({
  issue_key: z.string().min(1).describe("Issue key (e.g. PROJ-123)"),
  expand: z.array(z.string()).optional().describe("Expand additional data"),
});

const getIssueOutput = z.object({
  id: z.string().describe("Issue ID"),
  key: z.string().describe("Issue key"),
  summary: z.string().describe("Summary"),
  description: z.string().optional().describe("Description (Atlassian Document Format)"),
  status: z.string().describe("Current status"),
  assignee: z.string().optional().describe("Assignee display name"),
  reporter: z.string().optional().describe("Reporter display name"),
  priority: z.string().describe("Priority name"),
  issue_type: z.string().describe("Issue type name"),
  labels: z.array(z.string()).describe("Labels"),
  components: z.array(z.string()).describe("Component names"),
  created: z.string().describe("Created timestamp"),
  updated: z.string().describe("Updated timestamp"),
  resolution: z.string().optional().describe("Resolution"),
  parent: z.string().optional().describe("Parent issue key"),
  sprint: z.string().optional().describe("Sprint name"),
  story_points: z.number().optional().describe("Story points"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom fields"),
});

const createIssueInput = z.object({
  project_key: z.string().min(1).describe("Project key (e.g. PROJ)"),
  issue_type: z.string().min(1).describe("Issue type name (e.g. Bug, Task, Story)"),
  summary: z.string().min(1).describe("Issue summary"),
  description: z.string().optional().describe("Issue description"),
  priority: z.string().optional().describe("Priority name (e.g. High, Medium, Low)"),
  assignee: z.string().optional().describe("Assignee account ID or display name"),
  labels: z.array(z.string()).optional().describe("Labels"),
  components: z.array(z.string()).optional().describe("Component names"),
  parent_key: z.string().optional().describe("Parent issue key"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom field values"),
});

const createIssueOutput = z.object({
  id: z.string().describe("Created issue ID"),
  key: z.string().describe("Created issue key"),
  self: z.string().optional().describe("Issue URL"),
  created: z.boolean().describe("Whether creation was successful"),
});

const updateIssueInput = z.object({
  issue_key: z.string().min(1).describe("Issue key (e.g. PROJ-123)"),
  summary: z.string().optional().describe("Updated summary"),
  description: z.string().optional().describe("Updated description"),
  priority: z.string().optional().describe("Updated priority"),
  assignee: z.string().optional().describe("Updated assignee"),
  labels: z.array(z.string()).optional().describe("Updated labels"),
  components: z.array(z.string()).optional().describe("Updated components"),
  custom_fields: z.record(z.unknown()).optional().describe("Updated custom fields"),
});

const updateIssueOutput = z.object({
  id: z.string().describe("Updated issue ID"),
  key: z.string().describe("Issue key"),
  success: z.boolean().describe("Whether update was successful"),
});

const deleteIssueInput = z.object({
  issue_key: z.string().min(1).describe("Issue key to delete"),
});

const deleteIssueOutput = z.object({
  success: z.boolean().describe("Whether deletion was successful"),
  issue_key: z.string().describe("Deleted issue key"),
});

const transitionIssueInput = z.object({
  issue_key: z.string().min(1).describe("Issue key"),
  transition_id: z.string().optional().describe("Transition ID (if known)"),
  transition_name: z.string().optional().describe("Transition name (e.g. 'In Progress', 'Done')"),
  comment: z.string().optional().describe("Comment to add with transition"),
});

const transitionIssueOutput = z.object({
  success: z.boolean().describe("Whether transition was successful"),
  new_status: z.string().optional().describe("New status after transition"),
  available_transitions: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).optional().describe("Available transitions if transition_name didn't match"),
});

const addCommentInput = z.object({
  issue_key: z.string().min(1).describe("Issue key"),
  body: z.string().min(1).describe("Comment text"),
  visibility: z.enum(["all", "internal"]).default("all").describe("Comment visibility"),
});

const addCommentOutput = z.object({
  id: z.string().describe("Comment ID"),
  author: z.string().optional().describe("Comment author"),
  body: z.string().describe("Comment body"),
  created: z.string().describe("Creation timestamp"),
});

const listCommentsInput = z.object({
  issue_key: z.string().min(1).describe("Issue key"),
  max_results: z.number().int().min(1).max(100).default(50).describe("Max results"),
  start_at: z.number().int().min(0).default(0).describe("Offset"),
  order_by: z.enum(["created", "-created"]).default("-created").describe("Order by"),
});

const listCommentsOutput = z.object({
  comments: z.array(z.object({
    id: z.string().describe("Comment ID"),
    author: z.string().describe("Author display name"),
    body: z.string().describe("Comment body"),
    created: z.string().describe("Creation timestamp"),
    updated: z.string().optional().describe("Update timestamp"),
  })).describe("Comments"),
  total: z.number().describe("Total comments"),
});

const addAttachmentInput = z.object({
  issue_key: z.string().min(1).describe("Issue key"),
  filename: z.string().min(1).describe("Filename"),
  content_type: z.string().min(1).describe("MIME type"),
  content_base64: z.string().min(1).describe("Base64-encoded file content"),
});

const addAttachmentOutput = z.object({
  id: z.string().describe("Attachment ID"),
  filename: z.string().describe("Filename"),
  size: z.number().describe("File size in bytes"),
  created: z.string().optional(),
});

const listProjectsInput = z.object({
  max_results: z.number().int().min(1).max(100).default(50).describe("Max results"),
  start_at: z.number().int().min(0).default(0).describe("Offset"),
  recent: z.number().int().min(0).optional().describe("Only return recently viewed projects"),
});

const listProjectsOutput = z.object({
  projects: z.array(z.object({
    id: z.string().describe("Project ID"),
    key: z.string().describe("Project key"),
    name: z.string().describe("Project name"),
    description: z.string().optional(),
    project_type: z.string().optional(),
    lead: z.string().optional(),
    url: z.string().optional(),
  })).describe("Projects"),
  total: z.number().describe("Total projects"),
});

const listBoardsInput = z.object({
  project_key: z.string().optional().describe("Filter by project key"),
  max_results: z.number().int().min(1).max(100).default(50).describe("Max results"),
  start_at: z.number().int().min(0).default(0).describe("Offset"),
});

const listBoardsOutput = z.object({
  boards: z.array(z.object({
    id: z.string().describe("Board ID"),
    name: z.string().describe("Board name"),
    type: z.string().describe("Board type (scrum, kanban)"),
    project_key: z.string().optional().describe("Associated project key"),
    url: z.string().optional(),
  })).describe("Boards"),
  total: z.number().describe("Total boards"),
});

const listTransitionsInput = z.object({
  issue_key: z.string().min(1).describe("Issue key"),
});

const listTransitionsOutput = z.object({
  transitions: z.array(z.object({
    id: z.string().describe("Transition ID"),
    name: z.string().describe("Transition name"),
    to_status: z.string().describe("Target status"),
  })).describe("Available transitions"),
});

const webhookRegistrationInput = z.object({
  url: z.string().url().describe("Webhook callback URL"),
  events: z.array(z.string()).min(1).describe("Events to subscribe to (e.g. jira:issue_created, jira:issue_updated)"),
  filter: z.string().optional().describe("JQL filter for webhook"),
  description: z.string().optional().describe("Webhook description"),
});

const webhookRegistrationOutput = z.object({
  id: z.number().describe("Webhook ID"),
  url: z.string().describe("Registered webhook URL"),
  events: z.array(z.string()).describe("Subscribed events"),
  enabled: z.boolean().describe("Whether webhook is enabled"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAuthHeaders(
  ctx: OperationContext,
  accessToken: string,
): Record<string, string> {
  const auth = ctx.auth as { access_token?: string; api_token?: string; email?: string };
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (auth.api_token && auth.email) {
    // API Token auth (Basic Auth)
    headers.Authorization = `Basic ${btoa(`${auth.email}:${auth.api_token}`)}`;
  } else {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function jiraRequest<T = unknown>(
  baseUrl: string,
  path: string,
  ctx: OperationContext,
  accessToken: string,
  method: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  let url = `${baseUrl}${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  return withRetry(async () => {
    const headers = getAuthHeaders(ctx, accessToken);
    return apiRequest<T>(url, {
      method,
      accessToken,
      operation: "jira",
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }, 2, 1000);
}

// ─── Connector Definition ───────────────────────────────────────────────────

export const jiraConnector = defineConnector({
  provider: "jira",
  display_name: "Jira",
  description:
    "Jira Cloud connector for issue management, JQL search, projects, boards, and webhook registration. Supports both OAuth2 and API Token authentication.",
  base_url: "https://your-domain.atlassian.net",
  auth: {
    type: "oauth2",
    authorization_url: "https://auth.atlassian.com/authorize",
    token_url: "https://auth.atlassian.com/oauth/token",
    scopes: [
      "read:jira-work",
      "write:jira-work",
      "manage:jira-project",
      "read:jira-user",
      "read:jira-configuration",
      "offline_access",
    ],
  },
  default_headers: {
    Accept: "application/json",
  },
  version: "1.0.0",
  operations: [
    // ─── Issue Search ──────────────────────────────────────────────────────
    {
      name: "search_issues",
      description: "Search issues using JQL (Jira Query Language)",
      input: searchIssuesInput,
      output: searchIssuesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;
        const query: Record<string, string> = {
          jql: input.jql,
          maxResults: String(input.max_results),
          startAt: String(input.start_at),
        };
        if (input.fields?.length) query.fields = input.fields.join(",");
        if (input.expand?.length) query.expand = input.expand.join(",");

        const data = await jiraRequest<{
          issues: Array<{
            id: string;
            key: string;
            self: string;
            fields: {
              summary?: string;
              status?: { name: string };
              assignee?: { displayName: string };
              priority?: { name: string };
              issuetype?: { name: string };
              created?: string;
              updated?: string;
              labels?: string[];
              components?: Array<{ name: string }>;
              description?: string;
            };
          }>;
          total: number;
          startAt: number;
          maxResults: number;
        }>(baseUrl, "/rest/api/3/search", ctx, token, "GET", undefined, query);

        return {
          issues: data.issues.map((issue) => ({
            id: issue.id,
            key: issue.key,
            self: issue.self,
            summary: issue.fields.summary,
            status: issue.fields.status?.name,
            assignee: issue.fields.assignee?.displayName,
            priority: issue.fields.priority?.name,
            issue_type: issue.fields.issuetype?.name,
            created: issue.fields.created,
            updated: issue.fields.updated,
            labels: issue.fields.labels,
            components: issue.fields.components?.map((c) => c.name),
            description: issue.fields.description,
          })),
          total: data.total,
          start_at: data.startAt,
          max_results: data.maxResults,
          is_last: data.startAt + data.maxResults >= data.total,
        };
      },
    },
    // ─── Issue CRUD ────────────────────────────────────────────────────────
    {
      name: "get_issue",
      description: "Get issue details by key",
      input: getIssueInput,
      output: getIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;
        const query: Record<string, string> = {};
        if (input.expand?.length) query.expand = input.expand.join(",");

        const data = await jiraRequest<{
          id: string;
          key: string;
          fields: {
            summary: string;
            description?: string;
            status: { name: string };
            assignee?: { displayName: string };
            reporter?: { displayName: string };
            priority: { name: string };
            issuetype: { name: string };
            labels: string[];
            components: Array<{ name: string }>;
            created: string;
            updated: string;
            resolution?: { name: string };
            parent?: { key: string };
            sprint?: { name: string };
            story_points?: number;
            [key: string]: unknown;
          };
        }>(baseUrl, `/rest/api/3/issue/${input.issue_key}`, ctx, token, "GET", undefined, query);

        return {
          id: data.id,
          key: data.key,
          summary: data.fields.summary,
          description: data.fields.description,
          status: data.fields.status.name,
          assignee: data.fields.assignee?.displayName,
          reporter: data.fields.reporter?.displayName,
          priority: data.fields.priority.name,
          issue_type: data.fields.issuetype.name,
          labels: data.fields.labels,
          components: data.fields.components.map((c) => c.name),
          created: data.fields.created,
          updated: data.fields.updated,
          resolution: data.fields.resolution?.name,
          parent: data.fields.parent?.key,
          sprint: data.fields.sprint?.name,
          story_points: data.fields.story_points,
        };
      },
    },
    {
      name: "create_issue",
      description: "Create a new Jira issue",
      input: createIssueInput,
      output: createIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        const fields: Record<string, unknown> = {
          project: { key: input.project_key },
          issuetype: { name: input.issue_type },
          summary: input.summary,
        };

        if (input.description) fields.description = input.description;
        if (input.priority) fields.priority = { name: input.priority };
        if (input.assignee) fields.assignee = { accountId: input.assignee };
        if (input.labels) fields.labels = input.labels;
        if (input.components) fields.components = input.components.map((c) => ({ name: c }));
        if (input.parent_key) fields.parent = { key: input.parent_key };
        if (input.custom_fields) Object.assign(fields, input.custom_fields);

        const data = await jiraRequest<{
          id: string;
          key: string;
          self: string;
        }>(baseUrl, "/rest/api/3/issue", ctx, token, "POST", { fields });

        return {
          id: data.id,
          key: data.key,
          self: data.self,
          created: true,
        };
      },
    },
    {
      name: "update_issue",
      description: "Update an existing Jira issue",
      input: updateIssueInput,
      output: updateIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        const fields: Record<string, unknown> = {};
        if (input.summary) fields.summary = input.summary;
        if (input.description) fields.description = input.description;
        if (input.priority) fields.priority = { name: input.priority };
        if (input.assignee) fields.assignee = { accountId: input.assignee };
        if (input.labels) fields.labels = input.labels;
        if (input.components) fields.components = input.components.map((c) => ({ name: c }));
        if (input.custom_fields) Object.assign(fields, input.custom_fields);

        await jiraRequest(baseUrl, `/rest/api/3/issue/${input.issue_key}`, ctx, token, "PUT", { fields });

        return {
          id: input.issue_key,
          key: input.issue_key,
          success: true,
        };
      },
    },
    {
      name: "delete_issue",
      description: "Delete a Jira issue",
      input: deleteIssueInput,
      output: deleteIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        await jiraRequest(baseUrl, `/rest/api/3/issue/${input.issue_key}`, ctx, token, "DELETE");

        return {
          success: true,
          issue_key: input.issue_key,
        };
      },
    },
    // ─── Transitions ───────────────────────────────────────────────────────
    {
      name: "transition_issue",
      description: "Transition an issue to a new status",
      input: transitionIssueInput,
      output: transitionIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        let transitionId = input.transition_id;

        if (!transitionId && input.transition_name) {
          // Fetch available transitions and find by name
          const transitionsData = await jiraRequest<{
            transitions: Array<{ id: string; name: string; to: { name: string } }>;
          }>(
            baseUrl,
            `/rest/api/3/issue/${input.issue_key}/transitions`,
            ctx,
            token,
            "GET",
          );

          const match = transitionsData.transitions.find(
            (t) => t.name.toLowerCase() === input.transition_name!.toLowerCase(),
          );

          if (!match) {
            return {
              success: false,
              available_transitions: transitionsData.transitions.map((t) => ({
                id: t.id,
                name: t.name,
              })),
            };
          }

          transitionId = match.id;
        }

        if (!transitionId) {
          throw new ConnectorError("MISSING_PARAM", "transition_issue requires either transition_id or transition_name");
        }

        const body: Record<string, unknown> = {
          transition: { id: transitionId },
        };

        if (input.comment) {
          body.update = {
            comment: [{ add: { body: input.comment } }],
          };
        }

        await jiraRequest(baseUrl, `/rest/api/3/issue/${input.issue_key}/transitions`, ctx, token, "POST", body);

        return {
          success: true,
          new_status: input.transition_name,
        };
      },
    },
    {
      name: "list_transitions",
      description: "List available transitions for an issue",
      input: listTransitionsInput,
      output: listTransitionsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        const data = await jiraRequest<{
          transitions: Array<{ id: string; name: string; to: { name: string } }>;
        }>(
          baseUrl,
          `/rest/api/3/issue/${input.issue_key}/transitions`,
          ctx,
          token,
          "GET",
        );

        return {
          transitions: data.transitions.map((t) => ({
            id: t.id,
            name: t.name,
            to_status: t.to.name,
          })),
        };
      },
    },
    // ─── Comments ──────────────────────────────────────────────────────────
    {
      name: "add_comment",
      description: "Add a comment to an issue",
      input: addCommentInput,
      output: addCommentOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        const body: Record<string, unknown> = {
          body: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: input.body }],
              },
            ],
          },
        };

        const data = await jiraRequest<{
          id: string;
          author: { displayName: string };
          body: string;
          created: string;
        }>(baseUrl, `/rest/api/3/issue/${input.issue_key}/comment`, ctx, token, "POST", body);

        return {
          id: data.id,
          author: data.author?.displayName,
          body: data.body,
          created: data.created,
        };
      },
    },
    {
      name: "list_comments",
      description: "List comments on an issue",
      input: listCommentsInput,
      output: listCommentsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;
        const query: Record<string, string> = {
          maxResults: String(input.max_results),
          startAt: String(input.start_at),
          orderBy: input.order_by,
        };

        const data = await jiraRequest<{
          comments: Array<{
            id: string;
            author: { displayName: string };
            body: string;
            created: string;
            updated?: string;
          }>;
          total: number;
        }>(baseUrl, `/rest/api/3/issue/${input.issue_key}/comment`, ctx, token, "GET", undefined, query);

        return {
          comments: data.comments.map((c) => ({
            id: c.id,
            author: c.author.displayName,
            body: c.body,
            created: c.created,
            updated: c.updated,
          })),
          total: data.total,
        };
      },
    },
    // ─── Attachments ───────────────────────────────────────────────────────
    {
      name: "add_attachment",
      description: "Add an attachment to an issue",
      input: addAttachmentInput,
      output: addAttachmentOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        // Jira attachment API requires multipart form data
        const binaryContent = Buffer.from(input.content_base64, "base64");
        const formData = new FormData();
        const blob = new Blob([binaryContent], { type: input.content_type });
        formData.append("file", blob, input.filename);

        const headers = getAuthHeaders(ctx, token);
        delete headers["Content-Type"]; // Let browser set multipart boundary

        const response = await fetch(
          `${baseUrl}/rest/api/3/issue/${input.issue_key}/attachments`,
          {
            method: "POST",
            headers,
            body: formData,
          },
        );

        if (!response.ok) {
          const text = await response.text();
          throw new ConnectorError("ATTACHMENT_ERROR", `Failed to add attachment (${response.status}): ${text.slice(0, 300)}`, response.status);
        }

        const data = await response.json() as Array<{
          id: string;
          filename: string;
          size: number;
          created: string;
        }>;

        return {
          id: data[0]?.id ?? "",
          filename: data[0]?.filename ?? input.filename,
          size: data[0]?.size ?? binaryContent.length,
          created: data[0]?.created,
        };
      },
    },
    // ─── Projects & Boards ─────────────────────────────────────────────────
    {
      name: "list_projects",
      description: "List all Jira projects",
      input: listProjectsInput,
      output: listProjectsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;
        const query: Record<string, string> = {
          maxResults: String(input.max_results),
          startAt: String(input.start_at),
        };
        if (input.recent !== undefined) query.recent = String(input.recent);

        const data = await jiraRequest<Array<{
          id: string;
          key: string;
          name: string;
          description?: string;
          projectTypeKey?: string;
          lead?: { displayName: string };
          url?: string;
        }>>(baseUrl, "/rest/api/3/project", ctx, token, "GET", undefined, query);

        return {
          projects: data.map((p) => ({
            id: p.id,
            key: p.key,
            name: p.name,
            description: p.description,
            project_type: p.projectTypeKey,
            lead: p.lead?.displayName,
            url: p.url,
          })),
          total: data.length,
        };
      },
    },
    {
      name: "list_boards",
      description: "List Jira boards (Agile API)",
      input: listBoardsInput,
      output: listBoardsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;
        const query: Record<string, string> = {
          maxResults: String(input.max_results),
          startAt: String(input.start_at),
        };
        if (input.project_key) query.projectKeyOrId = input.project_key;

        const data = await jiraRequest<{
          values: Array<{
            id: number;
            name: string;
            type: string;
            location?: { projectKey?: string };
            self?: string;
          }>;
          total: number;
        }>(baseUrl, "/rest/agile/1.0/board", ctx, token, "GET", undefined, query);

        return {
          boards: data.values.map((b) => ({
            id: String(b.id),
            name: b.name,
            type: b.type,
            project_key: b.location?.projectKey,
            url: b.self,
          })),
          total: data.total,
        };
      },
    },
    // ─── Webhooks ──────────────────────────────────────────────────────────
    {
      name: "register_webhook",
      description: "Register a Jira webhook for event notifications",
      input: webhookRegistrationInput,
      output: webhookRegistrationOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = (ctx.auth as { instance_url?: string }).instance_url ?? ctx.base_url;

        const data = await jiraRequest<{
          id: number;
          url: string;
          events: string[];
          enabled: boolean;
        }>(baseUrl, "/rest/webhooks/1.0/webhook", ctx, token, "POST", {
          name: input.description ?? `Corelyx webhook for ${input.url}`,
          url: input.url,
          events: input.events,
          filter: input.filter,
          excludeBody: false,
        });

        return {
          id: data.id,
          url: data.url,
          events: data.events,
          enabled: data.enabled,
        };
      },
    },
  ],
});

export default jiraConnector;

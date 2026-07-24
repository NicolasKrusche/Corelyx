// ─── Linear Connector ───────────────────────────────────────────────────────
// Linear project management connector via GraphQL API.
// Operations: Issues, Cycles, Projects, Teams, Users
// Auth: OAuth2
// All operations use Linear's GraphQL API

import { z } from "zod";
import { defineConnector } from "@flowos/connector-kit";
import type { OperationContext } from "@flowos/connector-kit";
import { ConnectorError, graphqlRequest, withRetry } from "../utils.js";

const LINEAR_API_URL = "https://api.linear.app/graphql";

// ─── Schemas ────────────────────────────────────────────────────────────────

const listIssuesInput = z.object({
  team_id: z.string().optional().describe("Team ID to filter by"),
  assignee_id: z.string().optional().describe("Assignee ID to filter by"),
  state_id: z.string().optional().describe("Workflow state ID"),
  priority: z.number().int().min(0).max(4).optional().describe("Priority (0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low)"),
  label: z.string().optional().describe("Label name to filter by"),
  search: z.string().optional().describe("Search term for issue title/description"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
  after: z.string().optional().describe("Cursor for pagination"),
  order_by: z.enum(["created", "updated", "priority"]).default("created").describe("Sort field"),
});

const issueObject = z.object({
  id: z.string().describe("Issue ID"),
  identifier: z.string().describe("Issue identifier (e.g. TEAM-123)"),
  title: z.string().describe("Issue title"),
  description: z.string().optional().describe("Issue description (markdown)"),
  priority: z.number().describe("Priority (0-4)"),
  priority_label: z.string().optional().describe("Priority label"),
  state_name: z.string().optional().describe("Current state name"),
  assignee_name: z.string().optional().describe("Assignee display name"),
  team_name: z.string().optional().describe("Team name"),
  project_name: z.string().optional().describe("Project name"),
  estimate: z.number().optional().describe("Story point estimate"),
  due_date: z.string().optional().describe("Due date"),
  labels: z.array(z.string()).optional().describe("Labels"),
  url: z.string().describe("Linear URL"),
  created_at: z.string().describe("Created timestamp"),
  updated_at: z.string().describe("Updated timestamp"),
});

const listIssuesOutput = z.object({
  issues: z.array(issueObject).describe("Array of issues"),
  has_more: z.boolean().describe("Whether more pages exist"),
  next_cursor: z.string().optional().describe("Cursor for next page"),
});

const getIssueInput = z.object({
  issue_id: z.string().min(1).describe("Issue ID or identifier (e.g. TEAM-123)"),
});

const getIssueOutput = issueObject;

const createIssueInput = z.object({
  team_id: z.string().min(1).describe("Team ID"),
  title: z.string().min(1).describe("Issue title"),
  description: z.string().optional().describe("Issue description (markdown)"),
  priority: z.number().int().min(0).max(4).default(0).describe("Priority"),
  assignee_id: z.string().optional().describe("Assignee user ID"),
  project_id: z.string().optional().describe("Project ID"),
  label_ids: z.array(z.string()).optional().describe("Label IDs"),
  estimate: z.number().optional().describe("Story point estimate"),
  due_date: z.string().optional().describe("Due date (ISO 8601)"),
});

const createIssueOutput = z.object({
  id: z.string().describe("Created issue ID"),
  identifier: z.string().describe("Issue identifier"),
  url: z.string().describe("Issue URL"),
  success: z.boolean(),
});

const updateIssueInput = z.object({
  issue_id: z.string().min(1).describe("Issue ID or identifier"),
  title: z.string().optional().describe("Updated title"),
  description: z.string().optional().describe("Updated description"),
  priority: z.number().int().min(0).max(4).optional().describe("Updated priority"),
  assignee_id: z.string().optional().describe("Updated assignee ID (null to unassign)"),
  state_id: z.string().optional().describe("Updated workflow state ID"),
  project_id: z.string().optional().describe("Updated project ID"),
  label_ids: z.array(z.string()).optional().describe("Updated label IDs"),
  estimate: z.number().optional().describe("Updated estimate"),
  due_date: z.string().optional().describe("Updated due date"),
});

const updateIssueOutput = z.object({
  id: z.string().describe("Updated issue ID"),
  success: z.boolean(),
});

const deleteIssueInput = z.object({
  issue_id: z.string().min(1).describe("Issue ID or identifier"),
});

const deleteIssueOutput = z.object({
  success: z.boolean(),
  issue_id: z.string(),
});

const listProjectsInput = z.object({
  team_id: z.string().optional().describe("Filter by team ID"),
  status: z.enum(["planned", "in_progress", "completed", "canceled", "paused"]).optional().describe("Filter by status"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
  after: z.string().optional().describe("Cursor for pagination"),
});

const projectObject = z.object({
  id: z.string().describe("Project ID"),
  name: z.string().describe("Project name"),
  description: z.string().optional().describe("Project description"),
  status: z.string().describe("Project status"),
  progress: z.number().describe("Progress percentage (0-100)"),
  target_date: z.string().optional().describe("Target date"),
  team_name: z.string().optional().describe("Team name"),
  lead_name: z.string().optional().describe("Project lead name"),
  issue_count: z.number().optional().describe("Number of issues"),
  url: z.string().describe("Linear URL"),
  created_at: z.string().describe("Created timestamp"),
  updated_at: z.string().describe("Updated timestamp"),
});

const listProjectsOutput = z.object({
  projects: z.array(projectObject).describe("Array of projects"),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
});

const listTeamsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
  after: z.string().optional().describe("Cursor for pagination"),
});

const teamObject = z.object({
  id: z.string().describe("Team ID"),
  name: z.string().describe("Team name"),
  key: z.string().describe("Team key (e.g. ENG, PROJ)"),
  description: z.string().optional().describe("Team description"),
  private: z.boolean().optional().describe("Whether team is private"),
  issue_count: z.number().optional().describe("Number of issues"),
  member_count: z.number().optional().describe("Number of members"),
  url: z.string().describe("Linear URL"),
});

const listTeamsOutput = z.object({
  teams: z.array(teamObject).describe("Array of teams"),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
});

const listUsersInput = z.object({
  team_id: z.string().optional().describe("Filter by team ID"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
  after: z.string().optional().describe("Cursor for pagination"),
});

const userObject = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("Display name"),
  email: z.string().describe("Email"),
  avatar_url: z.string().optional().describe("Avatar URL"),
  active: z.boolean().describe("Whether user is active"),
  admin: z.boolean().optional().describe("Whether user is admin"),
});

const listUsersOutput = z.object({
  users: z.array(userObject).describe("Array of users"),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
});

const listCyclesInput = z.object({
  team_id: z.string().optional().describe("Filter by team ID"),
  status: z.enum(["draft", "in_progress", "completed", "canceled"]).optional().describe("Filter by status"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
  after: z.string().optional().describe("Cursor for pagination"),
});

const cycleObject = z.object({
  id: z.string().describe("Cycle ID"),
  name: z.string().describe("Cycle name"),
  description: z.string().optional().describe("Cycle description"),
  status: z.string().describe("Cycle status"),
  progress: z.number().describe("Progress percentage"),
  start_date: z.string().optional().describe("Start date"),
  end_date: z.string().optional().describe("End date"),
  team_name: z.string().optional().describe("Team name"),
  issue_count: z.number().optional().describe("Number of issues"),
  completed_issue_count: z.number().optional().describe("Completed issues"),
  url: z.string().describe("Linear URL"),
  created_at: z.string().describe("Created timestamp"),
});

const listCyclesOutput = z.object({
  cycles: z.array(cycleObject).describe("Array of cycles"),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
});

// ─── GraphQL Helpers ────────────────────────────────────────────────────────

const ISSUE_FRAGMENT = `
  id
  identifier
  title
  description
  priority
  priorityLabel
  state { name }
  assignee { name }
  team { name }
  project { name }
  estimate
  dueDate
  labels { nodes { name } }
  url
  createdAt
  updatedAt
`;

const PROJECT_FRAGMENT = `
  id
  name
  description
  status
  progress
  targetDate
  team { name }
  lead { name }
  issues { nodes { id } }
  url
  createdAt
  updatedAt
`;

const TEAM_FRAGMENT = `
  id
  name
  key
  description
  private
  issues { nodes { id } }
  members { nodes { id } }
  url
`;

const USER_FRAGMENT = `
  id
  name
  email
  avatarUrl
  active
  admin
`;

const CYCLE_FRAGMENT = `
  id
  name
  description
  status
  progress
  startDate
  endDate
  team { name }
  issues { nodes { id } }
  completedIssues { nodes { id } }
  url
  createdAt
`;

async function linearGql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
  operation?: string,
): Promise<T> {
  return withRetry(async () => {
    return graphqlRequest<T>(
      LINEAR_API_URL,
      query,
      variables,
      accessToken,
      operation,
    );
  }, 2, 1000);
}

// ─── Connector Definition ───────────────────────────────────────────────────

export const linearConnector = defineConnector({
  provider: "linear",
  display_name: "Linear",
  description:
    "Linear project management connector for issues, projects, teams, users, and cycles. Uses Linear's GraphQL API for efficient data fetching.",
  base_url: LINEAR_API_URL,
  auth: {
    type: "oauth2",
    authorization_url: "https://linear.app/oauth/authorize",
    token_url: "https://api.linear.app/oauth/token",
    scopes: [],
  },
  default_headers: {
    Accept: "application/json",
  },
  version: "1.0.0",
  operations: [
    // ─── Issue Operations ──────────────────────────────────────────────────
    {
      name: "list_issues",
      description: "List issues with filtering and pagination",
      input: listIssuesInput,
      output: listIssuesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const filters: string[] = [];
        if (input.team_id) filters.push(`team: { id: { eq: "${input.team_id}" } }`);
        if (input.assignee_id) filters.push(`assignee: { id: { eq: "${input.assignee_id}" } }`);
        if (input.state_id) filters.push(`state: { id: { eq: "${input.state_id}" } }`);
        if (input.priority !== undefined) filters.push(`priority: { eq: ${input.priority} }`);
        if (input.label) filters.push(`labels: { name: { eq: "${input.label}" } }`);
        if (input.search) filters.push(`title: { contains: "${input.search}" }`);

        const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";
        const orderBy = input.order_by === "priority" ? "priority" : input.order_by === "updated" ? "updatedAt" : "createdAt";

        const query = `
          query ($first: Int!, $after: String) {
            issues(first: $first, after: $after, ${filterStr}, orderBy: ${orderBy}) {
              nodes {
                ${ISSUE_FRAGMENT}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const data = await linearGql<{
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description?: string;
              priority: number;
              priorityLabel?: string;
              state?: { name: string };
              assignee?: { name: string };
              team?: { name: string };
              project?: { name: string };
              estimate?: number;
              dueDate?: string;
              labels?: { nodes: Array<{ name: string }> };
              url: string;
              createdAt: string;
              updatedAt: string;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
          };
        }>(query, { first: input.limit, after: input.after ?? null }, token, "linear-list-issues");

        return {
          issues: data.issues.nodes.map((issue) => ({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            priority: issue.priority,
            priority_label: issue.priorityLabel,
            state_name: issue.state?.name,
            assignee_name: issue.assignee?.name,
            team_name: issue.team?.name,
            project_name: issue.project?.name,
            estimate: issue.estimate,
            due_date: issue.dueDate,
            labels: issue.labels?.nodes.map((l) => l.name),
            url: issue.url,
            created_at: issue.createdAt,
            updated_at: issue.updatedAt,
          })),
          has_more: data.issues.pageInfo.hasNextPage,
          next_cursor: data.issues.pageInfo.endCursor,
        };
      },
    },
    {
      name: "get_issue",
      description: "Get a single issue by ID or identifier",
      input: getIssueInput,
      output: getIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        // Determine if input is an ID or identifier
        const isId = !input.issue_id.includes("-");
        const filter = isId
          ? `id: { eq: "${input.issue_id}" }`
          : `identifier: { eq: "${input.issue_id}" }`;

        const query = `
          query {
            issues(filter: { ${filter} }, first: 1) {
              nodes {
                ${ISSUE_FRAGMENT}
              }
            }
          }
        `;

        const data = await linearGql<{
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description?: string;
              priority: number;
              priorityLabel?: string;
              state?: { name: string };
              assignee?: { name: string };
              team?: { name: string };
              project?: { name: string };
              estimate?: number;
              dueDate?: string;
              labels?: { nodes: Array<{ name: string }> };
              url: string;
              createdAt: string;
              updatedAt: string;
            }>;
          };
        }>(query, {}, token, "linear-get-issue");

        const issue = data.issues.nodes[0];
        if (!issue) {
          throw new ConnectorError("NOT_FOUND", `Issue not found: ${input.issue_id}`);
        }

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          priority_label: issue.priorityLabel,
          state_name: issue.state?.name,
          assignee_name: issue.assignee?.name,
          team_name: issue.team?.name,
          project_name: issue.project?.name,
          estimate: issue.estimate,
          due_date: issue.dueDate,
          labels: issue.labels?.nodes.map((l) => l.name),
          url: issue.url,
          created_at: issue.createdAt,
          updated_at: issue.updatedAt,
        };
      },
    },
    {
      name: "create_issue",
      description: "Create a new issue in Linear",
      input: createIssueInput,
      output: createIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const inputFields: Record<string, unknown> = {
          teamId: input.team_id,
          title: input.title,
          priority: input.priority,
        };

        if (input.description) inputFields.description = input.description;
        if (input.assignee_id) inputFields.assigneeId = input.assignee_id;
        if (input.project_id) inputFields.projectId = input.project_id;
        if (input.label_ids?.length) inputFields.labelIds = input.label_ids;
        if (input.estimate !== undefined) inputFields.estimate = input.estimate;
        if (input.due_date) inputFields.dueDate = input.due_date;

        const query = `
          mutation ($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                url
              }
            }
          }
        `;

        const data = await linearGql<{
          issueCreate: {
            success: boolean;
            issue: { id: string; identifier: string; url: string };
          };
        }>(query, { input: inputFields }, token, "linear-create-issue");

        if (!data.issueCreate.success) {
          throw new ConnectorError("CREATE_FAILED", "Failed to create issue");
        }

        return {
          id: data.issueCreate.issue.id,
          identifier: data.issueCreate.issue.identifier,
          url: data.issueCreate.issue.url,
          success: true,
        };
      },
    },
    {
      name: "update_issue",
      description: "Update an existing issue",
      input: updateIssueInput,
      output: updateIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        // Resolve issue ID if identifier was provided
        let issueId = input.issue_id;
        if (!issueId.match(/^\w{8}-\w{4}/)) {
          const resolveQuery = `
            query {
              issues(filter: { identifier: { eq: "${issueId}" } }, first: 1) {
                nodes { id }
              }
            }
          `;
          const resolved = await linearGql<{
            issues: { nodes: Array<{ id: string }> };
          }>(resolveQuery, {}, token, "linear-resolve-issue");
          issueId = resolved.issues.nodes[0]?.id;
          if (!issueId) {
            throw new ConnectorError("NOT_FOUND", `Issue not found: ${input.issue_id}`);
          }
        }

        const inputFields: Record<string, unknown> = {};
        if (input.title !== undefined) inputFields.title = input.title;
        if (input.description !== undefined) inputFields.description = input.description;
        if (input.priority !== undefined) inputFields.priority = input.priority;
        if (input.assignee_id !== undefined) inputFields.assigneeId = input.assignee_id || null;
        if (input.state_id !== undefined) inputFields.stateId = input.state_id;
        if (input.project_id !== undefined) inputFields.projectId = input.project_id;
        if (input.label_ids !== undefined) inputFields.labelIds = input.label_ids;
        if (input.estimate !== undefined) inputFields.estimate = input.estimate;
        if (input.due_date !== undefined) inputFields.dueDate = input.due_date || null;

        const query = `
          mutation ($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
              success
              issue {
                id
              }
            }
          }
        `;

        const data = await linearGql<{
          issueUpdate: {
            success: boolean;
            issue: { id: string };
          };
        }>(query, { id: issueId, input: inputFields }, token, "linear-update-issue");

        return {
          id: data.issueUpdate.issue.id,
          success: data.issueUpdate.success,
        };
      },
    },
    {
      name: "delete_issue",
      description: "Delete an issue from Linear",
      input: deleteIssueInput,
      output: deleteIssueOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        // Resolve issue ID if identifier was provided
        let issueId = input.issue_id;
        if (!issueId.match(/^\w{8}-\w{4}/)) {
          const resolveQuery = `
            query {
              issues(filter: { identifier: { eq: "${issueId}" } }, first: 1) {
                nodes { id }
              }
            }
          `;
          const resolved = await linearGql<{
            issues: { nodes: Array<{ id: string }> };
          }>(resolveQuery, {}, token, "linear-resolve-issue");
          issueId = resolved.issues.nodes[0]?.id;
          if (!issueId) {
            throw new ConnectorError("NOT_FOUND", `Issue not found: ${input.issue_id}`);
          }
        }

        const query = `
          mutation ($id: String!) {
            issueDelete(id: $id) {
              success
            }
          }
        `;

        const data = await linearGql<{
          issueDelete: { success: boolean };
        }>(query, { id: issueId }, token, "linear-delete-issue");

        return {
          success: data.issueDelete.success,
          issue_id: issueId,
        };
      },
    },
    // ─── Project Operations ────────────────────────────────────────────────
    {
      name: "list_projects",
      description: "List projects with filtering",
      input: listProjectsInput,
      output: listProjectsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const filters: string[] = [];
        if (input.team_id) filters.push(`team: { id: { eq: "${input.team_id}" } }`);
        if (input.status) filters.push(`status: { eq: "${input.status}" }`);

        const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

        const query = `
          query ($first: Int!, $after: String) {
            projects(first: $first, after: $after, ${filterStr}) {
              nodes {
                ${PROJECT_FRAGMENT}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const data = await linearGql<{
          projects: {
            nodes: Array<{
              id: string;
              name: string;
              description?: string;
              status: string;
              progress: number;
              targetDate?: string;
              team?: { name: string };
              lead?: { name: string };
              issues?: { nodes: Array<{ id: string }> };
              url: string;
              createdAt: string;
              updatedAt: string;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
          };
        }>(query, { first: input.limit, after: input.after ?? null }, token, "linear-list-projects");

        return {
          projects: data.projects.nodes.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            progress: p.progress,
            target_date: p.targetDate,
            team_name: p.team?.name,
            lead_name: p.lead?.name,
            issue_count: p.issues?.nodes.length,
            url: p.url,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
          })),
          has_more: data.projects.pageInfo.hasNextPage,
          next_cursor: data.projects.pageInfo.endCursor,
        };
      },
    },
    // ─── Team Operations ───────────────────────────────────────────────────
    {
      name: "list_teams",
      description: "List all teams",
      input: listTeamsInput,
      output: listTeamsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const query = `
          query ($first: Int!, $after: String) {
            teams(first: $first, after: $after) {
              nodes {
                ${TEAM_FRAGMENT}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const data = await linearGql<{
          teams: {
            nodes: Array<{
              id: string;
              name: string;
              key: string;
              description?: string;
              private?: boolean;
              issues?: { nodes: Array<{ id: string }> };
              members?: { nodes: Array<{ id: string }> };
              url: string;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
          };
        }>(query, { first: input.limit, after: input.after ?? null }, token, "linear-list-teams");

        return {
          teams: data.teams.nodes.map((t) => ({
            id: t.id,
            name: t.name,
            key: t.key,
            description: t.description,
            private: t.private,
            issue_count: t.issues?.nodes.length,
            member_count: t.members?.nodes.length,
            url: t.url,
          })),
          has_more: data.teams.pageInfo.hasNextPage,
          next_cursor: data.teams.pageInfo.endCursor,
        };
      },
    },
    // ─── User Operations ───────────────────────────────────────────────────
    {
      name: "list_users",
      description: "List users in the organization",
      input: listUsersInput,
      output: listUsersOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const filters: string[] = [];
        if (input.team_id) filters.push(`team: { id: { eq: "${input.team_id}" } }`);
        const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

        const query = `
          query ($first: Int!, $after: String) {
            users(first: $first, after: $after, ${filterStr}) {
              nodes {
                ${USER_FRAGMENT}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const data = await linearGql<{
          users: {
            nodes: Array<{
              id: string;
              name: string;
              email: string;
              avatarUrl?: string;
              active: boolean;
              admin?: boolean;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
          };
        }>(query, { first: input.limit, after: input.after ?? null }, token, "linear-list-users");

        return {
          users: data.users.nodes.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            avatar_url: u.avatarUrl,
            active: u.active,
            admin: u.admin,
          })),
          has_more: data.users.pageInfo.hasNextPage,
          next_cursor: data.users.pageInfo.endCursor,
        };
      },
    },
    // ─── Cycle Operations ──────────────────────────────────────────────────
    {
      name: "list_cycles",
      description: "List team cycles (iterations)",
      input: listCyclesInput,
      output: listCyclesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const filters: string[] = [];
        if (input.team_id) filters.push(`team: { id: { eq: "${input.team_id}" } }`);
        if (input.status) filters.push(`status: { eq: "${input.status}" }`);
        const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

        const query = `
          query ($first: Int!, $after: String) {
            cycles(first: $first, after: $after, ${filterStr}) {
              nodes {
                ${CYCLE_FRAGMENT}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const data = await linearGql<{
          cycles: {
            nodes: Array<{
              id: string;
              name: string;
              description?: string;
              status: string;
              progress: number;
              startDate?: string;
              endDate?: string;
              team?: { name: string };
              issues?: { nodes: Array<{ id: string }> };
              completedIssues?: { nodes: Array<{ id: string }> };
              url: string;
              createdAt: string;
            }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
          };
        }>(query, { first: input.limit, after: input.after ?? null }, token, "linear-list-cycles");

        return {
          cycles: data.cycles.nodes.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            status: c.status,
            progress: c.progress,
            start_date: c.startDate,
            end_date: c.endDate,
            team_name: c.team?.name,
            issue_count: c.issues?.nodes.length,
            completed_issue_count: c.completedIssues?.nodes.length,
            url: c.url,
            created_at: c.createdAt,
          })),
          has_more: data.cycles.pageInfo.hasNextPage,
          next_cursor: data.cycles.pageInfo.endCursor,
        };
      },
    },
  ],
});

export default linearConnector;

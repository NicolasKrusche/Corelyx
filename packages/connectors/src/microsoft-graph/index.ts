// ─── Microsoft Graph Connector ──────────────────────────────────────────────
// Microsoft Graph API connector for enterprise productivity.
// Operations: /me, /users, /groups, /sites, /drives, /messages, /events, /chats
// Auth: OAuth2 with MSAL-style flow
// Features: Delta queries for change tracking

import { z } from "zod";
import { defineConnector } from "@flowos/connector-kit";
import type { OperationContext } from "@flowos/connector-kit";
import { apiRequest, ConnectorError, withRetry } from "../utils.js";

const BASE_URL = "https://graph.microsoft.com/v1.0";

// ─── Schemas ────────────────────────────────────────────────────────────────

const getMeInput = z.object({
  select: z.array(z.string()).optional().describe("Properties to select"),
});

const getMeOutput = z.object({
  id: z.string().describe("User ID"),
  displayName: z.string().describe("Display name"),
  mail: z.string().optional().describe("Email address"),
  userPrincipalName: z.string().optional().describe("UPN"),
  jobTitle: z.string().optional().describe("Job title"),
  department: z.string().optional().describe("Department"),
  officeLocation: z.string().optional().describe("Office location"),
  businessPhones: z.array(z.string()).optional().describe("Business phone numbers"),
  mobilePhone: z.string().optional().describe("Mobile phone"),
  preferredLanguage: z.string().optional().describe("Preferred language"),
});

const listUsersInput = z.object({
  search: z.string().optional().describe("Search query (e.g. displayName:John)"),
  filter: z.string().optional().describe("OData filter expression"),
  select: z.array(z.string()).optional().describe("Properties to select"),
  top: z.number().int().min(1).max(999).default(50).describe("Max results"),
  skip: z.number().int().min(0).default(0).describe("Number of results to skip"),
  order_by: z.string().optional().describe("Order by expression"),
  count: z.boolean().optional().describe("Include total count"),
});

const userObject = z.object({
  id: z.string().describe("User ID"),
  displayName: z.string().describe("Display name"),
  mail: z.string().optional().describe("Email"),
  userPrincipalName: z.string().optional().describe("UPN"),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  accountEnabled: z.boolean().optional(),
});

const listUsersOutput = z.object({
  value: z.array(userObject).describe("Array of users"),
  nextLink: z.string().optional().describe("URL for next page"),
  totalCount: z.number().optional().describe("Total count (if requested)"),
});

const listGroupsInput = z.object({
  search: z.string().optional().describe("Search query"),
  filter: z.string().optional().describe("OData filter"),
  select: z.array(z.string()).optional().describe("Properties to select"),
  top: z.number().int().min(1).max(999).default(50).describe("Max results"),
  order_by: z.string().optional(),
});

const groupObject = z.object({
  id: z.string().describe("Group ID"),
  displayName: z.string().describe("Display name"),
  description: z.string().optional(),
  mail: z.string().optional(),
  mailEnabled: z.boolean().optional(),
  securityEnabled: z.boolean().optional(),
  groupTypes: z.array(z.string()).optional(),
});

const listGroupsOutput = z.object({
  value: z.array(groupObject).describe("Array of groups"),
  nextLink: z.string().optional(),
});

const listSitesInput = z.object({
  site_path: z.string().optional().describe("Site path (e.g. /sites/mysite)"),
  search: z.string().optional().describe("Search query"),
  filter: z.string().optional(),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(50).describe("Max results"),
});

const siteObject = z.object({
  id: z.string().describe("Site ID"),
  displayName: z.string().describe("Display name"),
  name: z.string().optional().describe("Site name"),
  webUrl: z.string().optional().describe("Web URL"),
  description: z.string().optional(),
});

const listSitesOutput = z.object({
  value: z.array(siteObject).describe("Array of sites"),
  nextLink: z.string().optional(),
});

const listDrivesInput = z.object({
  site_id: z.string().optional().describe("Site ID (for site drives)"),
  user_id: z.string().optional().describe("User ID (for user drives)"),
  group_id: z.string().optional().describe("Group ID (for group drives)"),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(20).describe("Max results"),
});

const driveObject = z.object({
  id: z.string().describe("Drive ID"),
  name: z.string().describe("Drive name"),
  driveType: z.string().describe("Drive type"),
  description: z.object({ content: z.string() }).optional(),
  webUrl: z.string().optional(),
  owner: z.object({ user: z.object({ displayName: z.string() }).optional() }).optional(),
});

const listDrivesOutput = z.object({
  value: z.array(driveObject).describe("Array of drives"),
  nextLink: z.string().optional(),
});

const listDriveItemsInput = z.object({
  drive_id: z.string().min(1).describe("Drive ID"),
  folder_path: z.string().optional().describe("Folder path (default: root)"),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(20).describe("Max results"),
  order_by: z.string().optional(),
});

const driveItemObject = z.object({
  id: z.string().describe("Item ID"),
  name: z.string().describe("Item name"),
  size: z.number().optional().describe("File size in bytes"),
  file: z.object({ mimeType: z.string() }).optional().describe("File metadata"),
  folder: z.object({ childCount: z.number() }).optional().describe("Folder metadata"),
  webUrl: z.string().optional(),
  createdDateTime: z.string().optional(),
  lastModifiedDateTime: z.string().optional(),
});

const listDriveItemsOutput = z.object({
  value: z.array(driveItemObject).describe("Array of drive items"),
  nextLink: z.string().optional(),
});

const listMessagesInput = z.object({
  user_id: z.string().optional().describe("User ID (default: me)"),
  folder: z.string().optional().describe("Mail folder (e.g. inbox, drafts, sentitems)"),
  filter: z.string().optional().describe("OData filter"),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(20).describe("Max results"),
  order_by: z.string().optional(),
  search: z.string().optional().describe("Search query for message content"),
});

const messageObject = z.object({
  id: z.string().describe("Message ID"),
  subject: z.string().optional().describe("Subject"),
  bodyPreview: z.string().optional().describe("Body preview"),
  from: z.object({ emailAddress: z.object({ name: z.string(), address: z.string() }) }).optional(),
  toRecipients: z.array(z.object({ emailAddress: z.object({ name: z.string(), address: z.string() }) })).optional(),
  receivedDateTime: z.string().optional(),
  isRead: z.boolean().optional(),
  importance: z.string().optional(),
  hasAttachments: z.boolean().optional(),
});

const listMessagesOutput = z.object({
  value: z.array(messageObject).describe("Array of messages"),
  nextLink: z.string().optional(),
});

const sendMessageInput = z.object({
  user_id: z.string().optional().describe("User ID (default: me)"),
  to_recipients: z.array(z.string().email()).min(1).describe("Recipient email addresses"),
  cc_recipients: z.array(z.string().email()).optional().describe("CC recipients"),
  subject: z.string().min(1).describe("Message subject"),
  body: z.string().min(1).describe("Message body (HTML)"),
  body_content_type: z.enum(["HTML", "Text"]).default("HTML").describe("Body content type"),
  importance: z.enum(["Low", "Normal", "High"]).default("Normal"),
  attachments: z.array(z.object({
    name: z.string().describe("Attachment filename"),
    content_type: z.string().describe("MIME type"),
    content_bytes: z.string().describe("Base64-encoded content"),
  })).optional().describe("Attachments"),
});

const sendMessageOutput = z.object({
  id: z.string().optional().describe("Sent message ID"),
  success: z.boolean(),
});

const listEventsInput = z.object({
  user_id: z.string().optional().describe("User ID (default: me)"),
  filter: z.string().optional().describe("OData filter (e.g. start/dateTime ge '2024-01-01')"),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(20).describe("Max results"),
  order_by: z.string().optional(),
});

const eventObject = z.object({
  id: z.string().describe("Event ID"),
  subject: z.string().describe("Event subject"),
  start: z.object({ dateTime: z.string(), timeZone: z.string() }).optional(),
  end: z.object({ dateTime: z.string(), timeZone: z.string() }).optional(),
  location: z.object({ displayName: z.string() }).optional(),
  organizer: z.object({ emailAddress: z.object({ name: z.string(), address: z.string() }) }).optional(),
  isAllDay: z.boolean().optional(),
  webLink: z.string().optional(),
});

const listEventsOutput = z.object({
  value: z.array(eventObject).describe("Array of events"),
  nextLink: z.string().optional(),
});

const createEventInput = z.object({
  user_id: z.string().optional().describe("User ID (default: me)"),
  subject: z.string().min(1).describe("Event subject"),
  start: z.object({
    date_time: z.string().describe("Start date/time (ISO 8601)"),
    time_zone: z.string().default("UTC").describe("Time zone"),
  }).describe("Event start"),
  end: z.object({
    date_time: z.string().describe("End date/time (ISO 8601)"),
    time_zone: z.string().default("UTC").describe("Time zone"),
  }).describe("Event end"),
  location: z.string().optional().describe("Location display name"),
  attendees: z.array(z.object({
    email: z.string().email().describe("Attendee email"),
    type: z.enum(["Required", "Optional"]).default("Required"),
  })).optional().describe("Event attendees"),
  body: z.string().optional().describe("Event body (HTML)"),
  is_all_day: z.boolean().default(false).describe("All-day event"),
});

const createEventOutput = z.object({
  id: z.string().describe("Created event ID"),
  subject: z.string(),
  webLink: z.string().optional(),
});

const listChatsInput = z.object({
  filter: z.string().optional().describe("OData filter"),
  select: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(999).default(50).describe("Max results"),
  order_by: z.string().optional(),
});

const chatObject = z.object({
  id: z.string().describe("Chat ID"),
  topic: z.string().optional().describe("Chat topic"),
  chatType: z.string().describe("Chat type (oneOnOne, group, meeting)"),
  createdDateTime: z.string().optional(),
  lastUpdatedDateTime: z.string().optional(),
});

const listChatsOutput = z.object({
  value: z.array(chatObject).describe("Array of chats"),
  nextLink: z.string().optional(),
});

const listChatMessagesInput = z.object({
  chat_id: z.string().min(1).describe("Chat ID"),
  top: z.number().int().min(1).max(999).default(50).describe("Max results"),
  order_by: z.string().optional(),
});

const chatMessageObject = z.object({
  id: z.string().describe("Message ID"),
  body: z.object({ content: z.string(), contentType: z.string() }).optional(),
  from: z.object({ user: z.object({ displayName: z.string(), id: z.string() }) }).optional(),
  createdDateTime: z.string().optional(),
  lastEditedDateTime: z.string().optional(),
  deletedDateTime: z.string().optional(),
});

const listChatMessagesOutput = z.object({
  value: z.array(chatMessageObject).describe("Array of chat messages"),
  nextLink: z.string().optional(),
});

// ─── Delta Query Schemas ────────────────────────────────────────────────────

const deltaQueryInput = z.object({
  resource: z.string().min(1).describe("Microsoft Graph resource path (e.g. /users, /groups)"),
  delta_token: z.string().optional().describe("Delta token from previous query (omit for initial query)"),
  filter: z.string().optional().describe("OData filter"),
  select: z.array(z.string()).optional().describe("Properties to select"),
  top: z.number().int().min(1).max(999).default(100).describe("Max results"),
});

const deltaQueryOutput = z.object({
  value: z.array(z.record(z.unknown())).describe("Changed or new items"),
  deltaLink: z.string().optional().describe("Delta link for next poll (use as delta_token)"),
  nextLink: z.string().optional().describe("Pagination link for more changes"),
  removed: z.array(z.object({
    id: z.string().describe("ID of removed item"),
    reason: z.string().optional().describe("Removal reason (deleted, changed)"),
  })).describe("Items that were removed since last query"),
});

// ─── Helper ─────────────────────────────────────────────────────────────────

async function graphRequest<T = unknown>(
  path: string,
  accessToken: string,
  method: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  return withRetry(async () => {
    return apiRequest<T>(url, {
      method,
      accessToken,
      operation: "microsoft-graph",
      body: body ? JSON.stringify(body) : undefined,
    });
  }, 2, 1000);
}

// ─── Connector Definition ───────────────────────────────────────────────────

export const microsoftGraphConnector = defineConnector({
  provider: "microsoft-graph",
  display_name: "Microsoft Graph",
  description:
    "Microsoft Graph API connector for users, groups, sites, drives, mail, calendar events, and Teams chats. Supports delta queries for change tracking.",
  base_url: BASE_URL,
  auth: {
    type: "oauth2",
    authorization_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "User.Read",
      "User.Read.All",
      "Group.Read.All",
      "Sites.Read.All",
      "Mail.ReadWrite",
      "Mail.Send",
      "Calendars.ReadWrite",
      "Chat.ReadWrite",
      "offline_access",
    ],
  },
  default_headers: {
    Accept: "application/json",
  },
  version: "1.0.0",
  operations: [
    // ─── User Operations ───────────────────────────────────────────────────
    {
      name: "get_me",
      description: "Get the current signed-in user's profile",
      input: getMeInput,
      output: getMeOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = {};
        if (input.select?.length) query.$select = input.select.join(",");

        const data = await graphRequest<{
          id: string;
          displayName: string;
          mail?: string;
          userPrincipalName?: string;
          jobTitle?: string;
          department?: string;
          officeLocation?: string;
          businessPhones?: string[];
          mobilePhone?: string;
          preferredLanguage?: string;
        }>("/me", token, "GET", undefined, query);

        return {
          id: data.id,
          displayName: data.displayName,
          mail: data.mail,
          userPrincipalName: data.userPrincipalName,
          jobTitle: data.jobTitle,
          department: data.department,
          officeLocation: data.officeLocation,
          businessPhones: data.businessPhones,
          mobilePhone: data.mobilePhone,
          preferredLanguage: data.preferredLanguage,
        };
      },
    },
    {
      name: "list_users",
      description: "List or search users in the organization",
      input: listUsersInput,
      output: listUsersOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.search) query.$search = `"${input.search}"`;
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;
        if (input.count) query.$count = "true";

        const data = await graphRequest<{
          value: z.infer<typeof userObject>[];
          "@odata.nextLink"?: string;
          "@odata.count"?: number;
        }>("/users", token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
          totalCount: data["@odata.count"],
        };
      },
    },
    // ─── Group Operations ──────────────────────────────────────────────────
    {
      name: "list_groups",
      description: "List or search Microsoft 365 groups",
      input: listGroupsInput,
      output: listGroupsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.search) query.$search = `"${input.search}"`;
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;

        const data = await graphRequest<{
          value: z.infer<typeof groupObject>[];
          "@odata.nextLink"?: string;
        }>("/groups", token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    // ─── Site Operations ───────────────────────────────────────────────────
    {
      name: "list_sites",
      description: "List SharePoint sites in the organization",
      input: listSitesInput,
      output: listSitesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.search) query.$search = input.search;
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");

        const path = input.site_path ? `/sites/${input.site_path}` : "/sites";
        const data = await graphRequest<{
          value: z.infer<typeof siteObject>[];
          "@odata.nextLink"?: string;
        }>(path, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    // ─── Drive Operations ──────────────────────────────────────────────────
    {
      name: "list_drives",
      description: "List drives (OneDrive, SharePoint document libraries)",
      input: listDrivesInput,
      output: listDrivesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.select?.length) query.$select = input.select.join(",");

        let path: string;
        if (input.user_id) {
          path = `/users/${input.user_id}/drives`;
        } else if (input.group_id) {
          path = `/groups/${input.group_id}/drives`;
        } else if (input.site_id) {
          path = `/sites/${input.site_id}/drives`;
        } else {
          path = "/me/drives";
        }

        const data = await graphRequest<{
          value: z.infer<typeof driveObject>[];
          "@odata.nextLink"?: string;
        }>(path, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    {
      name: "list_drive_items",
      description: "List items in a drive folder",
      input: listDriveItemsInput,
      output: listDriveItemsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;

        const folderPath = input.folder_path ?? "root";
        const path = `/drives/${input.drive_id}/root:/${folderPath}:/children`;
        const data = await graphRequest<{
          value: z.infer<typeof driveItemObject>[];
          "@odata.nextLink"?: string;
        }>(path, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    // ─── Message Operations ────────────────────────────────────────────────
    {
      name: "list_messages",
      description: "List email messages from a user's mailbox",
      input: listMessagesInput,
      output: listMessagesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const userId = input.user_id ?? "me";
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;
        if (input.search) query.$search = `"${input.search}"`;

        const folderPath = input.folder ? `/${input.folder}` : "";
        const path = `/users/${userId}/mailFolders${folderPath}/messages`;
        const data = await graphRequest<{
          value: z.infer<typeof messageObject>[];
          "@odata.nextLink"?: string;
        }>(path, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    {
      name: "send_message",
      description: "Send an email message",
      input: sendMessageInput,
      output: sendMessageOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const userId = input.user_id ?? "me";

        const message: Record<string, unknown> = {
          subject: input.subject,
          body: {
            contentType: input.body_content_type,
            content: input.body,
          },
          toRecipients: input.to_recipients.map((email) => ({
            emailAddress: { address: email },
          })),
          importance: input.importance,
        };

        if (input.cc_recipients?.length) {
          message.ccRecipients = input.cc_recipients.map((email) => ({
            emailAddress: { address: email },
          }));
        }

        if (input.attachments?.length) {
          message.attachments = input.attachments.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.name,
            contentType: a.content_type,
            contentBytes: a.content_bytes,
          }));
        }

        const data = await graphRequest<{ id: string }>(
          `/users/${userId}/sendMail`,
          token,
          "POST",
          { message, saveToSentItems: true },
        );

        return {
          id: data.id,
          success: true,
        };
      },
    },
    // ─── Calendar Operations ───────────────────────────────────────────────
    {
      name: "list_events",
      description: "List calendar events for a user",
      input: listEventsInput,
      output: listEventsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const userId = input.user_id ?? "me";
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;

        const data = await graphRequest<{
          value: z.infer<typeof eventObject>[];
          "@odata.nextLink"?: string;
        }>(`/users/${userId}/events`, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    {
      name: "create_event",
      description: "Create a new calendar event",
      input: createEventInput,
      output: createEventOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const userId = input.user_id ?? "me";

        const event: Record<string, unknown> = {
          subject: input.subject,
          start: {
            dateTime: input.start.date_time,
            timeZone: input.start.time_zone,
          },
          end: {
            dateTime: input.end.date_time,
            timeZone: input.end.time_zone,
          },
          isAllDay: input.is_all_day,
        };

        if (input.location) {
          event.location = { displayName: input.location };
        }
        if (input.body) {
          event.body = { contentType: "HTML", content: input.body };
        }
        if (input.attendees?.length) {
          event.attendees = input.attendees.map((a) => ({
            emailAddress: { address: a.email },
            type: a.type,
          }));
        }

        const data = await graphRequest<{
          id: string;
          subject: string;
          webLink?: string;
        }>(`/users/${userId}/events`, token, "POST", event);

        return {
          id: data.id,
          subject: data.subject,
          webLink: data.webLink,
        };
      },
    },
    // ─── Chat Operations ───────────────────────────────────────────────────
    {
      name: "list_chats",
      description: "List Microsoft Teams chats",
      input: listChatsInput,
      output: listChatsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");
        if (input.order_by) query.$orderby = input.order_by;

        const data = await graphRequest<{
          value: z.infer<typeof chatObject>[];
          "@odata.nextLink"?: string;
        }>("/me/chats", token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    {
      name: "list_chat_messages",
      description: "List messages in a Teams chat",
      input: listChatMessagesInput,
      output: listChatMessagesOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.order_by) query.$orderby = input.order_by;

        const data = await graphRequest<{
          value: z.infer<typeof chatMessageObject>[];
          "@odata.nextLink"?: string;
        }>(`/me/chats/${input.chat_id}/messages`, token, "GET", undefined, query);

        return {
          value: data.value,
          nextLink: data["@odata.nextLink"],
        };
      },
    },
    // ─── Delta Query ───────────────────────────────────────────────────────
    {
      name: "delta_query",
      description:
        "Track changes in a Microsoft Graph resource using delta queries. On initial call, omit delta_token to get a baseline + deltaLink. On subsequent calls, use the deltaLink as delta_token.",
      input: deltaQueryInput,
      output: deltaQueryOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { $top: String(input.top) };
        if (input.filter) query.$filter = input.filter;
        if (input.select?.length) query.$select = input.select.join(",");

        let url: string;
        if (input.delta_token) {
          // Subsequent call: use the delta token
          url = input.delta_token;
        } else {
          // Initial call: use delta() function
          const resource = input.resource.startsWith("/") ? input.resource : `/${input.resource}`;
          url = `${resource}/delta`;
        }

        const allChanges: Record<string, unknown>[] = [];
        let deltaLink: string | undefined;
        const removed: Array<{ id: string; reason?: string }> = [];

        // Follow pagination to collect all changes
        let currentUrl = url.includes("deltaLink") || url.includes("?deltaToken=")
          ? url
          : `${BASE_URL}${url}`;
        let iterations = 0;
        const maxIterations = 10; // Safety limit

        while (currentUrl && iterations < maxIterations) {
          const response = await apiRequest<{
            value: Array<Record<string, unknown>>;
            "@odata.nextLink"?: string;
            "@odata.deltaLink"?: string;
            "@odata.removed"?: Array<{ id: string; reason?: string }>;
          }>(currentUrl, {
            method: "GET",
            accessToken: token,
            operation: "microsoft-graph-delta",
            headers: query.$filter || query.$select ? {} : {},
          });

          if (response.value) {
            allChanges.push(...response.value);
          }
          if (response["@odata.removed"]) {
            removed.push(...response["@odata.removed"]);
          }
          if (response["@odata.deltaLink"]) {
            deltaLink = response["@odata.deltaLink"];
          }
          if (response["@odata.nextLink"]) {
            currentUrl = response["@odata.nextLink"];
          } else {
            currentUrl = "";
          }
          iterations++;
        }

        return {
          value: allChanges,
          deltaLink,
          nextLink: undefined,
          removed,
        };
      },
    },
  ],
});

export default microsoftGraphConnector;

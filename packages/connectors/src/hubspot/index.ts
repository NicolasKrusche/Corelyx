// ─── HubSpot Deep Connector ─────────────────────────────────────────────────
// Extended HubSpot CRM connector beyond the basic operations.
// Operations: CRM Objects (Contacts, Companies, Deals, Tickets, Custom), Associations, Engagements, Workflows
// Auth: OAuth2

import { z } from "zod";
import { defineConnector } from "@flowos/connector-kit";
import type { OperationContext } from "@flowos/connector-kit";
import { apiRequest, ConnectorError, withRetry } from "../utils.js";

const BASE_URL = "https://api.hubapi.com";

// ─── Schemas ────────────────────────────────────────────────────────────────

const contactProperties = z.object({
  email: z.string().email().optional().describe("Contact email"),
  firstname: z.string().optional().describe("First name"),
  lastname: z.string().optional().describe("Last name"),
  phone: z.string().optional().describe("Phone number"),
  company: z.string().optional().describe("Company name"),
  jobtitle: z.string().optional().describe("Job title"),
  lifecyclestage: z.string().optional().describe("Lifecycle stage"),
  hs_lead_status: z.string().optional().describe("Lead status"),
});

const companyProperties = z.object({
  name: z.string().optional().describe("Company name"),
  domain: z.string().optional().describe("Company domain"),
  industry: z.string().optional().describe("Industry"),
  numberofemployees: z.number().optional().describe("Number of employees"),
  annualrevenue: z.number().optional().describe("Annual revenue"),
  city: z.string().optional().describe("City"),
  country: z.string().optional().describe("Country"),
});

const dealProperties = z.object({
  dealname: z.string().optional().describe("Deal name"),
  amount: z.number().optional().describe("Deal amount"),
  dealstage: z.string().optional().describe("Deal stage"),
  pipeline: z.string().optional().describe("Pipeline"),
  closedate: z.string().optional().describe("Close date (ISO 8601)"),
  hubspot_owner_id: z.string().optional().describe("Owner ID"),
});

const ticketProperties = z.object({
  subject: z.string().optional().describe("Ticket subject"),
  content: z.string().optional().describe("Ticket content"),
  hs_pipeline: z.string().optional().describe("Pipeline ID"),
  hs_pipeline_stage: z.string().optional().describe("Pipeline stage"),
  hs_ticket_priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().describe("Priority"),
  hs_ticket_category: z.string().optional().describe("Category"),
});

const customObjectProperties = z.record(z.unknown()).describe("Custom object properties");

const listCrmObjectsInput = z.object({
  object_type: z.enum(["contacts", "companies", "deals", "tickets", "custom"]).describe("CRM object type"),
  custom_object_type_id: z.string().optional().describe("Custom object type ID (required if object_type is 'custom')"),
  limit: z.number().int().min(1).max(100).default(20).describe("Number of results"),
  after: z.string().optional().describe("Pagination cursor"),
  properties: z.array(z.string()).optional().describe("Properties to include"),
  filter_groups: z.array(z.object({
    filters: z.array(z.object({
      property_name: z.string(),
      operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAIN", "NOT_CONTAIN", "IN", "NOT_IN", "HAS_PROPERTY", "NOT_HAS_PROPERTY"]),
      value: z.string(),
    })),
  })).optional().describe("Filter groups for search"),
});

const listCrmObjectsOutput = z.object({
  results: z.array(z.object({
    id: z.string().describe("Object ID"),
    properties: z.record(z.string()).describe("Object properties"),
    created_at: z.string().optional().describe("Creation timestamp"),
    updated_at: z.string().optional().describe("Last update timestamp"),
  })).describe("Array of CRM objects"),
  paging: z.object({
    next: z.object({ after: z.string(), link: z.string() }).optional(),
    prev: z.object({ before: z.string(), link: z.string() }).optional(),
  }).optional().describe("Pagination info"),
  total: z.number().optional().describe("Total matching records"),
});

const getCrmObjectInput = z.object({
  object_type: z.enum(["contacts", "companies", "deals", "tickets", "custom"]).describe("CRM object type"),
  custom_object_type_id: z.string().optional().describe("Custom object type ID"),
  object_id: z.string().min(1).describe("Object ID"),
  properties: z.array(z.string()).optional().describe("Properties to include"),
});

const getCrmObjectOutput = z.object({
  id: z.string().describe("Object ID"),
  properties: z.record(z.string()).describe("Object properties"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  archived: z.boolean().optional(),
});

const createCrmObjectInput = z.object({
  object_type: z.enum(["contacts", "companies", "deals", "tickets", "custom"]).describe("CRM object type"),
  custom_object_type_id: z.string().optional().describe("Custom object type ID"),
  properties: z.record(z.string()).describe("Object properties to set"),
});

const createCrmObjectOutput = z.object({
  id: z.string().describe("Created object ID"),
  properties: z.record(z.string()).describe("Created object properties"),
});

const updateCrmObjectInput = z.object({
  object_type: z.enum(["contacts", "companies", "deals", "tickets", "custom"]).describe("CRM object type"),
  custom_object_type_id: z.string().optional().describe("Custom object type ID"),
  object_id: z.string().min(1).describe("Object ID to update"),
  properties: z.record(z.string()).describe("Properties to update"),
});

const updateCrmObjectOutput = z.object({
  id: z.string().describe("Updated object ID"),
  properties: z.record(z.string()).describe("Updated object properties"),
});

const deleteCrmObjectInput = z.object({
  object_type: z.enum(["contacts", "companies", "deals", "tickets", "custom"]).describe("CRM object type"),
  custom_object_type_id: z.string().optional().describe("Custom object type ID"),
  object_id: z.string().min(1).describe("Object ID to delete"),
});

const deleteCrmObjectOutput = z.object({
  success: z.boolean().describe("Whether deletion was successful"),
  object_id: z.string().describe("Deleted object ID"),
});

const getAssociationsInput = z.object({
  from_object_type: z.string().min(1).describe("Source object type (e.g. contacts, deals)"),
  to_object_type: z.string().min(1).describe("Target object type (e.g. companies, contacts)"),
  object_id: z.string().min(1).describe("Source object ID"),
  limit: z.number().int().min(1).max(100).default(10).describe("Max associations"),
});

const getAssociationsOutput = z.object({
  results: z.array(z.object({
    id: z.string().describe("Associated object ID"),
    type: z.string().describe("Association type label"),
  })).describe("Associated objects"),
});

const createAssociationInput = z.object({
  from_object_type: z.string().min(1).describe("Source object type"),
  to_object_type: z.string().min(1).describe("Target object type"),
  from_object_id: z.string().min(1).describe("Source object ID"),
  to_object_id: z.string().min(1).describe("Target object ID"),
  association_type: z.string().optional().describe("Association type label (e.g. contact_to_company)"),
});

const createAssociationOutput = z.object({
  success: z.boolean().describe("Whether association was created"),
  from_object_id: z.string(),
  to_object_id: z.string(),
});

const listEngagementsInput = z.object({
  object_type: z.string().min(1).describe("Object type (contacts, companies, deals)"),
  object_id: z.string().min(1).describe("Object ID"),
  engagement_types: z.array(z.enum(["calls", "emails", "meetings", "notes", "tasks"])).optional().describe("Filter by engagement types"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
});

const listEngagementsOutput = z.object({
  results: z.array(z.object({
    id: z.string().describe("Engagement ID"),
    type: z.string().describe("Engagement type"),
    timestamp: z.string().describe("Engagement timestamp"),
    body: z.string().optional().describe("Engagement body"),
    subject: z.string().optional().describe("Engagement subject"),
    metadata: z.record(z.unknown()).optional().describe("Type-specific metadata"),
  })).describe("Engagement records"),
});

const createEngagementInput = z.object({
  engagement_type: z.enum(["calls", "emails", "meetings", "notes", "tasks"]).describe("Engagement type"),
  subject: z.string().optional().describe("Engagement subject"),
  body: z.string().optional().describe("Engagement body/note"),
  timestamp: z.string().optional().describe("Engagement timestamp (ISO 8601)"),
  metadata: z.record(z.unknown()).optional().describe("Type-specific metadata (e.g. email_to, email_from)"),
  associations: z.array(z.object({
    object_type: z.string(),
    object_id: z.string(),
  })).optional().describe("Objects to associate with"),
});

const createEngagementOutput = z.object({
  id: z.string().describe("Created engagement ID"),
  type: z.string().describe("Engagement type"),
  success: z.boolean(),
});

const listWorkflowsInput = z.object({
  limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
  after: z.string().optional().describe("Pagination cursor"),
});

const listWorkflowsOutput = z.object({
  results: z.array(z.object({
    id: z.string().describe("Workflow ID"),
    name: z.string().describe("Workflow name"),
    enabled: z.boolean().describe("Whether workflow is enabled"),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })).describe("Workflow definitions"),
  paging: z.object({
    next: z.object({ after: z.string(), link: z.string() }).optional(),
  }).optional(),
});

const getWorkflowInput = z.object({
  workflow_id: z.string().min(1).describe("Workflow ID"),
});

const getWorkflowOutput = z.object({
  id: z.string().describe("Workflow ID"),
  name: z.string().describe("Workflow name"),
  enabled: z.boolean().describe("Whether workflow is enabled"),
  actions: z.array(z.object({
    type: z.string(),
    config: z.record(z.unknown()).optional(),
  })).optional().describe("Workflow actions"),
  triggers: z.array(z.object({
    type: z.string(),
    config: z.record(z.unknown()).optional(),
  })).optional().describe("Workflow triggers"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function objectPath(objectType: string, customObjectTypeId?: string): string {
  if (objectType === "custom" && customObjectTypeId) {
    return `/crm/v3/objects/${encodeURIComponent(customObjectTypeId)}`;
  }
  return `/crm/v3/objects/${objectType}`;
}

async function hsRequest<T = unknown>(
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
      operation: "hubspot",
      body: body ? JSON.stringify(body) : undefined,
    });
  }, 2, 1000);
}

// ─── Connector Definition ───────────────────────────────────────────────────

export const hubspotDeepConnector = defineConnector({
  provider: "hubspot",
  display_name: "HubSpot",
  description:
    "Extended HubSpot CRM connector with full object CRUD, associations, engagements, and workflow management. Goes beyond basic contacts and deals.",
  base_url: BASE_URL,
  auth: {
    type: "oauth2",
    authorization_url: "https://app.hubspot.com/oauth/authorize",
    token_url: "https://api.hubapi.com/oauth/v1/token",
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.objects.tickets.read",
      "crm.objects.tickets.write",
      "crm.schemas.custom.read",
      "e-marketing",
      "automation",
    ],
  },
  default_headers: {
    Accept: "application/json",
  },
  version: "1.0.0",
  operations: [
    // ─── CRM Object Operations ────────────────────────────────────────────
    {
      name: "list_crm_objects",
      description: "List CRM objects (contacts, companies, deals, tickets, or custom objects)",
      input: listCrmObjectsInput,
      output: listCrmObjectsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const basePath = objectPath(input.object_type, input.custom_object_type_id);
        const query: Record<string, string> = {
          limit: String(input.limit),
        };
        if (input.after) query.after = input.after;
        if (input.properties?.length) query.properties = input.properties.join(",");
        if (input.filter_groups?.length) {
          query.filterGroups = JSON.stringify(input.filter_groups);
        }

        const data = await hsRequest<{
          results: Array<{ id: string; properties: Record<string, string>; createdAt?: string; updatedAt?: string }>;
          paging?: { next?: { after: string; link: string }; prev?: { before: string; link: string } };
          total?: number;
        }>(basePath, token, "GET", undefined, query);

        return {
          results: data.results.map((r) => ({
            id: r.id,
            properties: r.properties,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
          })),
          paging: data.paging,
          total: data.total,
        };
      },
    },
    {
      name: "get_crm_object",
      description: "Get a single CRM object by ID",
      input: getCrmObjectInput,
      output: getCrmObjectOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const basePath = objectPath(input.object_type, input.custom_object_type_id);
        const query: Record<string, string> = {};
        if (input.properties?.length) query.properties = input.properties.join(",");

        const data = await hsRequest<{
          id: string;
          properties: Record<string, string>;
          createdAt?: string;
          updatedAt?: string;
          archived?: boolean;
        }>(`${basePath}/${input.object_id}`, token, "GET", undefined, query);

        return {
          id: data.id,
          properties: data.properties,
          created_at: data.createdAt,
          updated_at: data.updatedAt,
          archived: data.archived,
        };
      },
    },
    {
      name: "create_crm_object",
      description: "Create a new CRM object",
      input: createCrmObjectInput,
      output: createCrmObjectOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const basePath = objectPath(input.object_type, input.custom_object_type_id);

        const data = await hsRequest<{
          id: string;
          properties: Record<string, string>;
        }>(basePath, token, "POST", { properties: input.properties });

        return { id: data.id, properties: data.properties };
      },
    },
    {
      name: "update_crm_object",
      description: "Update an existing CRM object",
      input: updateCrmObjectInput,
      output: updateCrmObjectOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const basePath = objectPath(input.object_type, input.custom_object_type_id);

        await hsRequest(`${basePath}/${input.object_id}`, token, "PATCH", {
          properties: input.properties,
        });

        return {
          id: input.object_id,
          properties: input.properties,
        };
      },
    },
    {
      name: "delete_crm_object",
      description: "Delete a CRM object",
      input: deleteCrmObjectInput,
      output: deleteCrmObjectOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const basePath = objectPath(input.object_type, input.custom_object_type_id);

        await hsRequest(`${basePath}/${input.object_id}`, token, "DELETE");

        return {
          success: true,
          object_id: input.object_id,
        };
      },
    },
    // ─── Association Operations ────────────────────────────────────────────
    {
      name: "get_associations",
      description: "Get associations for a CRM object",
      input: getAssociationsInput,
      output: getAssociationsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const url = `/crm/v3/objects/${input.from_object_type}/${input.object_id}/associations/${input.to_object_type}`;
        const data = await hsRequest<{
          results: Array<{ id: string; type: string }>;
        }>(url, token, "GET", undefined, { limit: String(input.limit) });

        return { results: data.results };
      },
    },
    {
      name: "create_association",
      description: "Create an association between two CRM objects",
      input: createAssociationInput,
      output: createAssociationOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const url = `/crm/v3/objects/${input.from_object_type}/${input.from_object_id}/associations/${input.to_object_type}/${input.to_object_id}`;
        const associationType = input.association_type ?? `${input.from_object_type}_to_${input.to_object_type}`;

        await hsRequest(url, token, "PUT", [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }]);

        return {
          success: true,
          from_object_id: input.from_object_id,
          to_object_id: input.to_object_id,
        };
      },
    },
    // ─── Engagement Operations ─────────────────────────────────────────────
    {
      name: "list_engagements",
      description: "List engagements (calls, emails, meetings, notes, tasks) for a CRM object",
      input: listEngagementsInput,
      output: listEngagementsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = {
          limit: String(input.limit),
        };
        if (input.engagement_types?.length) {
          query.engagementTypes = input.engagement_types.join(",");
        }

        const data = await hsRequest<{
          results: Array<{
            id: string;
            type: string;
            timestamp: string;
            body?: string;
            subject?: string;
            metadata?: Record<string, unknown>;
          }>;
        }>(`/engagements/v1/engagements/associations/${input.object_type}/${input.object_id}`, token, "GET", undefined, query);

        return { results: data.results };
      },
    },
    {
      name: "create_engagement",
      description: "Create a new engagement (call, email, meeting, note, or task)",
      input: createEngagementInput,
      output: createEngagementOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const payload: Record<string, unknown> = {
          engagement: {
            type: input.engagement_type,
            timestamp: input.timestamp ? new Date(input.timestamp).getTime() : Date.now(),
          },
        };

        if (input.subject) (payload.engagement as Record<string, unknown>).subject = input.subject;
        if (input.body) {
          (payload.engagement as Record<string, unknown>).bodyPreview = input.body;
          (payload.metadata as Record<string, unknown>)[`${input.engagement_type}_body`] = input.body;
        }
        if (input.metadata) {
          payload.metadata = { ...((payload.metadata as Record<string, unknown>) ?? {}), ...input.metadata };
        }

        if (input.associations?.length) {
          payload.associations = input.associations.map((a) => ({
            type: `${input.engagement_type}_to_${a.object_type}`,
            [`${a.object_type}Ids`]: [a.object_id],
          }));
        }

        const data = await hsRequest<{
          engagement: { id: string; type: string };
        }>("/engagements/v1/engagements", token, "POST", payload);

        return {
          id: data.engagement.id,
          type: data.engagement.type,
          success: true,
        };
      },
    },
    // ─── Workflow Operations ───────────────────────────────────────────────
    {
      name: "list_workflows",
      description: "List all workflows in the HubSpot account",
      input: listWorkflowsInput,
      output: listWorkflowsOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const query: Record<string, string> = { limit: String(input.limit) };
        if (input.after) query.after = input.after;

        const data = await hsRequest<{
          results: Array<{
            id: string;
            name: string;
            enabled: boolean;
            createdAt?: string;
            updatedAt?: string;
          }>;
          paging?: { next?: { after: string; link: string } };
        }>("/automation/v3/workflows", token, "GET", undefined, query);

        return {
          results: data.results.map((w) => ({
            id: w.id,
            name: w.name,
            enabled: w.enabled,
            created_at: w.createdAt,
            updated_at: w.updatedAt,
          })),
          paging: data.paging,
        };
      },
    },
    {
      name: "get_workflow",
      description: "Get details of a specific workflow including its actions and triggers",
      input: getWorkflowInput,
      output: getWorkflowOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;

        const data = await hsRequest<{
          id: string;
          name: string;
          enabled: boolean;
          actions?: Array<{ type: string; config?: Record<string, unknown> }>;
          triggers?: Array<{ type: string; config?: Record<string, unknown> }>;
          createdAt?: string;
          updatedAt?: string;
        }>(`/automation/v3/workflows/${input.workflow_id}`, token, "GET");

        return {
          id: data.id,
          name: data.name,
          enabled: data.enabled,
          actions: data.actions,
          triggers: data.triggers,
          created_at: data.createdAt,
          updated_at: data.updatedAt,
        };
      },
    },
  ],
});

export default hubspotDeepConnector;

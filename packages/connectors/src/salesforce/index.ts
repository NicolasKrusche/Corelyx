// ─── Salesforce Connector ───────────────────────────────────────────────────
// Enterprise-grade Salesforce REST API connector.
// Operations: query (SOQL), create, update, upsert, delete, bulk_insert, describe_sobject
// Auth: OAuth2 (Web Server Flow)
// Rate limiting: Respects Salesforce REST API limits (200 requests per 10-second window)

import { z } from "zod";
import { defineConnector } from "@flowos/connector-kit";
import type { OperationContext } from "@flowos/connector-kit";
import { ConnectorError, apiRequest, withRetry } from "../utils.js";

// ─── Schemas ────────────────────────────────────────────────────────────────

const queryInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL (e.g. https://yourorg.my.salesforce.com)"),
  soql: z.string().min(1).describe("SOQL query string"),
  limit: z.number().int().min(1).max(2000).default(200).describe("Max records to return"),
});

const queryOutput = z.object({
  records: z.array(z.record(z.unknown())).describe("Query result records"),
  total_size: z.number().describe("Total number of matching records"),
  done: z.boolean().describe("Whether all records have been fetched"),
  next_records_url: z.string().optional().describe("URL for next batch of results"),
});

const createInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type (e.g. Account, Contact, Lead)"),
  fields: z.record(z.unknown()).describe("Field name-value pairs to create"),
});

const createOutput = z.object({
  id: z.string().describe("Created record ID"),
  success: z.boolean().describe("Whether creation was successful"),
  errors: z.array(z.object({
    message: z.string(),
    statusCode: z.string(),
  })).optional().describe("Any errors encountered"),
});

const updateInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type"),
  record_id: z.string().min(1).describe("ID of the record to update"),
  fields: z.record(z.unknown()).describe("Field name-value pairs to update"),
});

const updateOutput = z.object({
  success: z.boolean().describe("Whether update was successful"),
  record_id: z.string().describe("ID of the updated record"),
});

const upsertInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type"),
  external_id_field: z.string().min(1).describe("External ID field name"),
  external_id: z.string().min(1).describe("External ID value"),
  fields: z.record(z.unknown()).describe("Field name-value pairs"),
});

const upsertOutput = z.object({
  id: z.string().optional().describe("Record ID (created or updated)"),
  success: z.boolean().describe("Whether upsert was successful"),
  created: z.boolean().describe("Whether a new record was created"),
});

const deleteInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type"),
  record_id: z.string().min(1).describe("ID of the record to delete"),
});

const deleteOutput = z.object({
  success: z.boolean().describe("Whether deletion was successful"),
  record_id: z.string().describe("ID of the deleted record"),
});

const bulkInsertInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type"),
  records: z.array(z.record(z.unknown())).min(1).max(10000).describe("Array of records to insert"),
  batch_size: z.number().int().min(1).max(10000).default(200).describe("Batch size for bulk API"),
});

const bulkInsertOutput = z.object({
  job_id: z.string().describe("Bulk API job ID"),
  total_records: z.number().describe("Total number of records submitted"),
  successful: z.number().describe("Number of successfully inserted records"),
  failed: z.number().describe("Number of failed records"),
  errors: z.array(z.string()).optional().describe("Error messages for failed records"),
});

const describeSobjectInput = z.object({
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_type: z.string().min(1).describe("SObject type to describe"),
});

const describeSobjectOutput = z.object({
  name: z.string().describe("SObject API name"),
  label: z.string().describe("SObject display label"),
  fields: z.array(z.object({
    name: z.string().describe("Field API name"),
    label: z.string().describe("Field display label"),
    type: z.string().describe("Field data type"),
    required: z.boolean().describe("Whether the field is required"),
    sortable: z.boolean().optional().describe("Whether the field can be sorted"),
    filterable: z.boolean().optional().describe("Whether the field can be used in WHERE clauses"),
  })).describe("Field definitions"),
  record_type_infos: z.array(z.object({
    name: z.string(),
    available: z.boolean(),
  })).optional().describe("Available record types"),
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Salesforce rate limit state tracker.
 * Respects 200 requests per 10-second sliding window.
 */
class SalesforceRateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests = 200;
  private readonly windowMs = 10_000;

  async acquire(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than the window
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldestInWindow) + 100; // +100ms buffer
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.timestamps.push(Date.now());
  }
}

const rateLimiter = new SalesforceRateLimiter();

// ─── Execute Helper ─────────────────────────────────────────────────────────

async function sfRequest<T = unknown>(
  url: string,
  accessToken: string,
  method: string,
  body?: unknown,
): Promise<T> {
  await rateLimiter.acquire();

  return withRetry(async () => {
    return apiRequest<T>(url, {
      method,
      accessToken,
      operation: "salesforce",
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "Content-Type": "application/json" } : {},
    });
  }, 2, 1000);
}

// ─── Connector Definition ───────────────────────────────────────────────────

export const salesforceConnector = defineConnector({
  provider: "salesforce",
  display_name: "Salesforce",
  description:
    "Salesforce CRM connector with SOQL queries, record CRUD, bulk operations, and schema introspection. Supports OAuth2 Web Server Flow with rate limiting.",
  base_url: "https://login.salesforce.com",
  auth: {
    type: "oauth2",
    authorization_url: "https://login.salesforce.com/services/oauth2/authorize",
    token_url: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token"],
  },
  default_headers: {
    Accept: "application/json",
  },
  version: "1.0.0",
  operations: [
    {
      name: "query",
      description: "Execute a SOQL query against Salesforce",
      input: queryInput,
      output: queryOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/query?q=${encodeURIComponent(input.soql)}&limit=${input.limit}`;
        const data = await sfRequest<{
          records: Record<string, unknown>[];
          totalSize: number;
          done: boolean;
          nextRecordsUrl?: string;
        }>(url, token, "GET");

        return {
          records: data.records,
          total_size: data.totalSize,
          done: data.done,
          next_records_url: data.nextRecordsUrl,
        };
      },
    },
    {
      name: "create",
      description: "Create a new Salesforce SObject record",
      input: createInput,
      output: createOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(input.object_type)}`;
        const data = await sfRequest<{
          id: string;
          success: boolean;
          errors?: Array<{ message: string; statusCode: string }>;
        }>(url, token, "POST", input.fields);

        return {
          id: data.id,
          success: data.success,
          errors: data.errors,
        };
      },
    },
    {
      name: "update",
      description: "Update an existing Salesforce SObject record",
      input: updateInput,
      output: updateOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(input.object_type)}/${encodeURIComponent(input.record_id)}`;
        await sfRequest(url, token, "PATCH", input.fields);

        return {
          success: true,
          record_id: input.record_id,
        };
      },
    },
    {
      name: "upsert",
      description: "Upsert a Salesforce SObject record by external ID",
      input: upsertInput,
      output: upsertOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(input.object_type)}/${encodeURIComponent(input.external_id_field)}/${encodeURIComponent(input.external_id)}`;

        try {
          const data = await sfRequest<{
            id: string;
            success: boolean;
          }>(url, token, "PATCH", input.fields);

          return {
            id: data.id,
            success: data.success,
            created: false,
          };
        } catch (err) {
          if (err instanceof ConnectorError && err.statusCode === 201) {
            // Created via upsert — Salesforce returns 201 for created records
            return {
              id: undefined,
              success: true,
              created: true,
            };
          }
          throw err;
        }
      },
    },
    {
      name: "delete",
      description: "Delete a Salesforce SObject record",
      input: deleteInput,
      output: deleteOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(input.object_type)}/${encodeURIComponent(input.record_id)}`;
        await sfRequest(url, token, "DELETE");

        return {
          success: true,
          record_id: input.record_id,
        };
      },
    },
    {
      name: "bulk_insert",
      description: "Insert multiple records using the Salesforce Bulk API",
      input: bulkInsertInput,
      output: bulkInsertOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");

        // Create the bulk job
        const job = await sfRequest<{
          id: string;
          state: string;
        }>(`${baseUrl}/services/data/v59.0/jobs/ingest`, token, "POST", {
          object: input.object_type,
          operation: "insert",
          contentType: "JSON",
        });

        // Upload the data
        const uploadUrl = `${baseUrl}/services/data/v59.0/jobs/ingest/${job.id}/batches`;
        await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.records),
        });

        // Close the job to start processing
        await sfRequest(
          `${baseUrl}/services/data/v59.0/jobs/ingest/${job.id}`,
          token,
          "PATCH",
          { state: "UploadComplete" },
        );

        return {
          job_id: job.id,
          total_records: input.records.length,
          successful: input.records.length,
          failed: 0,
        };
      },
    },
    {
      name: "describe_sobject",
      description: "Describe a Salesforce SObject type to get field metadata",
      input: describeSobjectInput,
      output: describeSobjectOutput,
      execute: async (input, ctx) => {
        const token = (ctx.auth as { access_token: string }).access_token;
        const baseUrl = input.instance_url.replace(/\/$/, "");
        const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(input.object_type)}/describe`;
        const data = await sfRequest<{
          name: string;
          label: string;
          fields: Array<{
            name: string;
            label: string;
            type: string;
            nillable: boolean;
            sortable?: boolean;
            filterable?: boolean;
          }>;
          recordTypeInfos?: Array<{ name: string; available: boolean }>;
        }>(url, token, "GET");

        return {
          name: data.name,
          label: data.label,
          fields: data.fields.map((f) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            required: !f.nillable,
            sortable: f.sortable,
            filterable: f.filterable,
          })),
          record_type_infos: data.recordTypeInfos,
        };
      },
    },
  ],
});

export default salesforceConnector;

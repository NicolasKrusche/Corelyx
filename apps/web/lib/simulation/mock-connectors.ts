/**
 * Mock connector responses for simulation mode.
 *
 * Each provider maps operation names to realistic-looking payloads
 * so the visual dry-run produces plausible input/output data without
 * hitting real APIs.
 */

export interface MockResponsePayload {
  /** The mock response body */
  data: Record<string, unknown>;
  /** HTTP status code to simulate */
  status: number;
  /** Simulated latency range in ms [min, max] */
  latency_ms: [number, number];
  /** Estimated cost in USD for this operation */
  estimated_cost_usd: number;
  /** Estimated token count (for LLM-adjacent connectors) */
  estimated_tokens: number;
}

export interface ConnectorMockDefinition {
  /** Human-readable provider name */
  name: string;
  /** Operations this connector supports */
  operations: Record<string, MockResponsePayload>;
  /** Fallback when operation not found */
  fallback: MockResponsePayload;
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

const gmailMock: ConnectorMockDefinition = {
  name: "Gmail",
  operations: {
    list_emails: {
      data: {
        emails: [
          {
            id: "msg_mock_001",
            threadId: "thread_001",
            subject: "Project Kickoff - Q3 Planning",
            from: "alice@acme-corp.com",
            to: "user@example.com",
            received_at: "2026-07-22T10:30:00Z",
            preview: "Hi team, I'd like to schedule our Q3 planning session...",
            is_read: false,
            labels: ["INBOX", "PROJECTS"],
            snippet: "Hi team, I'd like to schedule our Q3 planning session for next Tuesday at 2pm. Please review the attached roadmap and come prepared...",
          },
          {
            id: "msg_mock_002",
            threadId: "thread_002",
            subject: "Invoice #INV-2026-0742",
            from: "billing@vendor.io",
            to: "user@example.com",
            received_at: "2026-07-22T09:15:00Z",
            preview: "Your monthly invoice is ready for review.",
            is_read: true,
            labels: ["INBOX", "FINANCE"],
            snippet: "Your monthly invoice for July 2026 is ready. Total: $2,450.00. Payment due by August 5th.",
          },
        ],
        total_count: 2,
        has_more: false,
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    read_email: {
      data: {
        id: "msg_mock_001",
        threadId: "thread_001",
        subject: "Project Kickoff - Q3 Planning",
        from: "alice@acme-corp.com",
        to: "user@example.com",
        cc: ["bob@acme-corp.com"],
        received_at: "2026-07-22T10:30:00Z",
        body: "Hi team,\n\nI'd like to schedule our Q3 planning session for next Tuesday at 2pm. Please review the attached roadmap and come prepared with your department updates.\n\nAgenda:\n1. Q2 retrospective\n2. Q3 roadmap review\n3. Resource allocation\n4. Open discussion\n\nBest,\nAlice",
        labels: ["INBOX", "PROJECTS"],
        attachments: [
          { filename: "q3-roadmap.pdf", size: 245000, mime_type: "application/pdf" },
        ],
      },
      status: 200,
      latency_ms: [80, 200],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    send_email: {
      data: {
        id: "msg_sent_mock_001",
        threadId: "thread_sent_001",
        subject: "Re: Project Kickoff - Q3 Planning",
        to: "alice@acme-corp.com",
        sent_at: new Date().toISOString(),
        status: "sent",
      },
      status: 200,
      latency_ms: [200, 500],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    search_emails: {
      data: {
        emails: [
          {
            id: "msg_mock_003",
            threadId: "thread_003",
            subject: "Weekly Status Report",
            from: "manager@acme-corp.com",
            received_at: "2026-07-21T16:00:00Z",
            preview: "Here's the weekly status update...",
          },
        ],
        total_count: 1,
      },
      status: 200,
      latency_ms: [150, 400],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "gmail", message: "Unknown Gmail operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Slack ───────────────────────────────────────────────────────────────────

const slackMock: ConnectorMockDefinition = {
  name: "Slack",
  operations: {
    send_message: {
      data: {
        ok: true,
        ts: "1753201800.123456",
        channel: "C07ABC123",
        message: {
          text: "Hello from simulation! This is a mock Slack message.",
          username: "Corelyx Bot",
          type: "message",
        },
      },
      status: 200,
      latency_ms: [100, 250],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    list_channels: {
      data: {
        ok: true,
        channels: [
          { id: "C07ABC123", name: "general", is_private: false, num_members: 42 },
          { id: "C07DEF456", name: "engineering", is_private: false, num_members: 15 },
          { id: "P07GHI789", name: "project-alpha", is_private: true, num_members: 8 },
        ],
      },
      status: 200,
      latency_ms: [80, 200],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    list_messages: {
      data: {
        ok: true,
        messages: [
          {
            ts: "1753198200.654321",
            user: "U07USER01",
            text: "Has anyone reviewed the latest deploy?",
            type: "message",
          },
          {
            ts: "1753198800.111222",
            user: "U07USER02",
            text: "Yes, looks good. Approved.",
            type: "message",
          },
        ],
        has_more: false,
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    upload_file: {
      data: {
        ok: true,
        file: {
          id: "F07FILE001",
          name: "report.pdf",
          url_private: "https://files.slack-edge.com/mock/report.pdf",
        },
      },
      status: 200,
      latency_ms: [200, 600],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "slack", message: "Unknown Slack operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Notion ──────────────────────────────────────────────────────────────────

const notionMock: ConnectorMockDefinition = {
  name: "Notion",
  operations: {
    create_database_entry: {
      data: {
        id: "notion_page_mock_001",
        object: "page",
        url: "https://notion.so/corelyx/Project-Kickoff-abc123",
        created_time: new Date().toISOString(),
        last_edited_time: new Date().toISOString(),
        properties: {
          Name: { title: [{ text: { content: "New Project Entry" } }] },
          Status: { select: { name: "In Progress" } },
          "Created By": { rich_text: [{ text: { content: "Corelyx Bot" } }] },
        },
      },
      status: 200,
      latency_ms: [200, 500],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    query_database: {
      data: {
        object: "list",
        results: [
          {
            id: "result_001",
            object: "page",
            properties: {
              Name: { title: [{ text: { content: "Q3 Planning Doc" } }] },
              Status: { select: { name: "Active" } },
              Priority: { select: { name: "High" } },
            },
            created_time: "2026-07-20T08:00:00Z",
          },
          {
            id: "result_002",
            object: "page",
            properties: {
              Name: { title: [{ text: { content: "API Documentation" } }] },
              Status: { select: { name: "Draft" } },
              Priority: { select: { name: "Medium" } },
            },
            created_time: "2026-07-21T14:30:00Z",
          },
        ],
        has_more: false,
        total_count: 2,
      },
      status: 200,
      latency_ms: [150, 400],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    update_page: {
      data: {
        id: "notion_page_mock_001",
        object: "page",
        url: "https://notion.so/corelyx/Project-Kickoff-abc123",
        last_edited_time: new Date().toISOString(),
      },
      status: 200,
      latency_ms: [150, 350],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    get_page: {
      data: {
        id: "notion_page_mock_001",
        object: "page",
        url: "https://notion.so/corelyx/Project-Kickoff-abc123",
        properties: {
          Name: { title: [{ text: { content: "Project Kickoff" } }] },
          Status: { select: { name: "In Progress" } },
        },
        content: "This is the project kickoff document with meeting notes and action items.",
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "notion", message: "Unknown Notion operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── GitHub ──────────────────────────────────────────────────────────────────

const githubMock: ConnectorMockDefinition = {
  name: "GitHub",
  operations: {
    create_issue: {
      data: {
        id: 1042,
        number: 42,
        title: "Mock Issue: Implement simulation mode",
        state: "open",
        url: "https://github.com/org/repo/issues/42",
        html_url: "https://github.com/org/repo/issues/42",
        user: { login: "corelyx-bot", id: 99999 },
        labels: [{ name: "enhancement", color: "a2eeef" }],
        created_at: new Date().toISOString(),
        body: "This is a mock issue created during simulation.",
      },
      status: 201,
      latency_ms: [200, 600],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    list_prs: {
      data: {
        pull_requests: [
          {
            id: 501,
            number: 101,
            title: "feat: Add simulation mode",
            state: "open",
            user: { login: "developer" },
            created_at: "2026-07-21T10:00:00Z",
            head: { ref: "feature/simulation" },
            base: { ref: "main" },
          },
          {
            id: 502,
            number: 102,
            title: "fix: Resolve edge mapping bug",
            state: "closed",
            user: { login: "developer" },
            merged_at: "2026-07-20T15:30:00Z",
          },
        ],
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    create_comment: {
      data: {
        id: 8001,
        body: "Mock comment posted by Corelyx simulation.",
        user: { login: "corelyx-bot" },
        created_at: new Date().toISOString(),
      },
      status: 201,
      latency_ms: [150, 400],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    list_repos: {
      data: {
        repos: [
          { name: "corelyx-web", full_name: "org/corelyx-web", private: true, language: "TypeScript" },
          { name: "corelyx-runtime", full_name: "org/corelyx-runtime", private: true, language: "Python" },
        ],
      },
      status: 200,
      latency_ms: [80, 200],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    get_issue: {
      data: {
        id: 1042,
        number: 42,
        title: "Mock Issue: Implement simulation mode",
        state: "open",
        body: "This is the full issue body with details about what needs to be done.",
        labels: [{ name: "enhancement" }, { name: "priority:high" }],
        assignees: [{ login: "developer" }],
        comments: 3,
      },
      status: 200,
      latency_ms: [80, 200],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "github", message: "Unknown GitHub operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Google Sheets ───────────────────────────────────────────────────────────

const sheetsMock: ConnectorMockDefinition = {
  name: "Google Sheets",
  operations: {
    read_range: {
      data: {
        range: "Sheet1!A1:D5",
        values: [
          ["ID", "Name", "Email", "Status"],
          ["1", "Alice Johnson", "alice@example.com", "Active"],
          ["2", "Bob Smith", "bob@example.com", "Active"],
          ["3", "Carol White", "carol@example.com", "Inactive"],
          ["4", "Dave Brown", "dave@example.com", "Pending"],
        ],
        row_count: 5,
        col_count: 4,
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    append_row: {
      data: {
        updated_range: "Sheet1!A6:D6",
        updated_rows: 1,
        updated_cells: 4,
        spreadsheet_id: "mock_spreadsheet_id",
      },
      status: 200,
      latency_ms: [150, 400],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    update_cells: {
      data: {
        updated_range: "Sheet1!B2",
        updated_rows: 1,
        updated_cells: 1,
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    create_sheet: {
      data: {
        spreadsheet_id: "mock_new_sheet_id",
        title: "New Sheet",
        url: "https://docs.google.com/spreadsheets/d/mock_new_sheet_id",
      },
      status: 200,
      latency_ms: [200, 500],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "sheets", message: "Unknown Sheets operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── HTTP Generic ────────────────────────────────────────────────────────────

const httpMock: ConnectorMockDefinition = {
  name: "HTTP",
  operations: {
    request: {
      data: {
        status_code: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "mock_req_001",
          "x-ratelimit-remaining": "999",
        },
        body: {
          mock: true,
          message: "HTTP Generic mock response",
          data: {
            id: 1,
            name: "Mock Resource",
            created_at: new Date().toISOString(),
          },
        },
        elapsed_ms: 142,
      },
      status: 200,
      latency_ms: [100, 500],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "http", message: "Unknown HTTP operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── PostgreSQL ──────────────────────────────────────────────────────────────

const postgresqlMock: ConnectorMockDefinition = {
  name: "PostgreSQL",
  operations: {
    query: {
      data: {
        rows: [
          { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "admin", created_at: "2026-01-15T10:00:00Z" },
          { id: 2, name: "Bob Smith", email: "bob@example.com", role: "user", created_at: "2026-03-22T14:30:00Z" },
          { id: 3, name: "Carol White", email: "carol@example.com", role: "editor", created_at: "2026-06-01T09:15:00Z" },
        ],
        row_count: 3,
        columns: ["id", "name", "email", "role", "created_at"],
        query_time_ms: 12,
      },
      status: 200,
      latency_ms: [30, 150],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    execute: {
      data: {
        rows_affected: 1,
        command: "INSERT",
        query_time_ms: 8,
      },
      status: 200,
      latency_ms: [20, 100],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    list_tables: {
      data: {
        tables: [
          { name: "users", schema: "public", row_estimate: 1500 },
          { name: "orders", schema: "public", row_estimate: 8200 },
          { name: "products", schema: "public", row_estimate: 350 },
          { name: "sessions", schema: "public", row_estimate: 42000 },
        ],
      },
      status: 200,
      latency_ms: [20, 80],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "postgresql", message: "Unknown PostgreSQL operation" },
    status: 200,
    latency_ms: [20, 60],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Redis ───────────────────────────────────────────────────────────────────

const redisMock: ConnectorMockDefinition = {
  name: "Redis",
  operations: {
    get: {
      data: {
        value: '{"session_id":"mock_123","user_id":42,"expires_at":"2026-07-23T10:00:00Z"}',
        exists: true,
        type: "string",
        ttl_seconds: 3600,
      },
      status: 200,
      latency_ms: [5, 30],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    set: {
      data: {
        ok: true,
        previous_value: null,
      },
      status: 200,
      latency_ms: [5, 25],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    incr: {
      data: {
        value: 43,
        key: "mock:counter",
      },
      status: 200,
      latency_ms: [3, 15],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    del: {
      data: {
        deleted_count: 1,
      },
      status: 200,
      latency_ms: [3, 15],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    hgetall: {
      data: {
        hash: {
          user_id: "42",
          name: "Mock User",
          email: "mock@example.com",
          plan: "pro",
        },
        field_count: 4,
      },
      status: 200,
      latency_ms: [5, 25],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "redis", message: "Unknown Redis operation" },
    status: 200,
    latency_ms: [3, 10],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Airtable ────────────────────────────────────────────────────────────────

const airtableMock: ConnectorMockDefinition = {
  name: "Airtable",
  operations: {
    list_records: {
      data: {
        records: [
          {
            id: "recMock001",
            fields: { Name: "Project Alpha", Status: "Active", Priority: "High", Owner: "Alice" },
            created_time: "2026-07-20T08:00:00Z",
          },
          {
            id: "recMock002",
            fields: { Name: "Project Beta", Status: "Planning", Priority: "Medium", Owner: "Bob" },
            created_time: "2026-07-21T12:00:00Z",
          },
        ],
        total_count: 2,
        has_more: false,
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    create_record: {
      data: {
        record: {
          id: "recMock003",
          fields: { Name: "New Record", Status: "Draft" },
          created_time: new Date().toISOString(),
        },
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
    update_record: {
      data: {
        record: {
          id: "recMock001",
          fields: { Status: "Completed" },
          created_time: "2026-07-20T08:00:00Z",
        },
      },
      status: 200,
      latency_ms: [100, 300],
      estimated_cost_usd: 0,
      estimated_tokens: 0,
    },
  },
  fallback: {
    data: { mock: true, provider: "airtable", message: "Unknown Airtable operation" },
    status: 200,
    latency_ms: [50, 100],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  },
};

// ─── Agent/LLM Mock ─────────────────────────────────────────────────────────

const agentMock: ConnectorMockDefinition = {
  name: "Agent",
  operations: {
    chat: {
      data: {
        response: "[MOCK AGENT] I've processed your request and generated a response based on the input context. The analysis shows 3 key findings that align with the provided data.",
        model: "gpt-4o-mini",
        usage: {
          prompt_tokens: 150,
          completion_tokens: 85,
          total_tokens: 235,
        },
        estimated_cost_usd: 0.0012,
        finish_reason: "stop",
      },
      status: 200,
      latency_ms: [800, 2000],
      estimated_cost_usd: 0.0012,
      estimated_tokens: 235,
    },
    complete: {
      data: {
        response: "[MOCK AGENT] Task completed successfully. Output generated with structured format.",
        model: "gpt-4o-mini",
        usage: {
          prompt_tokens: 200,
          completion_tokens: 120,
          total_tokens: 320,
        },
        estimated_cost_usd: 0.0018,
        finish_reason: "stop",
      },
      status: 200,
      latency_ms: [1000, 3000],
      estimated_cost_usd: 0.0018,
      estimated_tokens: 320,
    },
  },
  fallback: {
    data: {
      response: "[MOCK AGENT] Processing complete.",
      model: "gpt-4o-mini",
      estimated_cost_usd: 0.001,
      estimated_tokens: 100,
    },
    status: 200,
    latency_ms: [500, 1500],
    estimated_cost_usd: 0.001,
    estimated_tokens: 100,
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const CONNECTOR_MOCK_REGISTRY: Record<string, ConnectorMockDefinition> = {
  gmail: gmailMock,
  google_mail: gmailMock,
  slack: slackMock,
  notion: notionMock,
  github: githubMock,
  sheets: sheetsMock,
  google_sheets: sheetsMock,
  http: httpMock,
  http_generic: httpMock,
  postgresql: postgresqlMock,
  postgres: postgresqlMock,
  redis: redisMock,
  airtable: airtableMock,
  agent: agentMock,
  llm: agentMock,
};

/**
 * Look up a mock response for a given connector + operation.
 *
 * Falls back to a generic mock if the provider or operation isn't registered.
 */
export function getMockResponse(
  provider: string,
  operation: string,
  config: Record<string, unknown> = {}
): MockResponsePayload {
  const normalizedProvider = provider.toLowerCase().replace(/[\s-]/g, "_");
  const normalizedOp = operation.toLowerCase().replace(/[\s-]/g, "_");

  const connector = CONNECTOR_MOCK_REGISTRY[normalizedProvider];

  if (connector) {
    // Try exact match first, then fuzzy match
    const matchedOp =
      connector.operations[normalizedOp] ??
      Object.entries(connector.operations).find(
        ([key]) => normalizedOp.includes(key) || key.includes(normalizedOp)
      )?.[1];

    if (matchedOp) {
      return matchedOp;
    }
    return connector.fallback;
  }

  // Unknown provider — return a generic mock
  return {
    data: {
      mock: true,
      provider: normalizedProvider,
      operation: normalizedOp,
      message: `No mock defined for provider "${provider}", operation "${operation}". Using generic mock response.`,
      config_keys: Object.keys(config),
    },
    status: 200,
    latency_ms: [50, 200],
    estimated_cost_usd: 0,
    estimated_tokens: 0,
  };
}

/**
 * Get the list of all registered mock connector provider names.
 */
export function getRegisteredProviders(): string[] {
  return Object.keys(CONNECTOR_MOCK_REGISTRY);
}

/**
 * Get the list of operations for a given connector.
 */
export function getConnectorOperations(provider: string): string[] {
  const normalized = provider.toLowerCase().replace(/[\s-]/g, "_");
  const connector = CONNECTOR_MOCK_REGISTRY[normalized];
  return connector ? Object.keys(connector.operations) : [];
}

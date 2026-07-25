/**
 * Shared E2E test data.
 *
 * Credentials default to the shared demo account but can be overridden per
 * environment with TEST_EMAIL / TEST_PASSWORD (e.g. in CI secrets or a local
 * .env.local). Never point these at a real customer account.
 */

export const TEST_USER = {
  email: process.env.TEST_EMAIL || "demo@corelyx.systems",
  password: process.env.TEST_PASSWORD || "Corelyx2025!",
};

/** Key routes used across specs, kept in one place so refactors are cheap. */
export const ROUTES = {
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  programsNew: "/programs/new",
  connections: "/connections",
  editor: (programId: string) => `/programs/${programId}/editor`,
} as const;

/**
 * A minimal, valid-ish program schema used when a spec needs to assert on the
 * raw-schema panel or seed a workflow shape without going through Genesis.
 * Mirrors the ProgramSchema contract (nodes + edges) at a high level.
 */
export const SAMPLE_PROGRAM = {
  name: "E2E Sample Program",
  description: "Fixture workflow used by the Playwright editor specs.",
  schema: {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        subtype: "manual",
        position: { x: 0, y: 0 },
        data: { label: "Manual trigger" },
      },
      {
        id: "step-1",
        type: "step",
        subtype: "transform",
        position: { x: 320, y: 0 },
        data: { label: "Transform" },
      },
    ],
    edges: [{ id: "edge-1", source: "trigger-1", target: "step-1" }],
  },
} as const;

/** A natural-language prompt exercised by the Genesis flow. */
export const GENESIS_PROMPT =
  "When a new row is added to a Google Sheet, summarize it with an AI model and " +
  "send the summary to a Slack channel.";

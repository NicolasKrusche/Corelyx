import { describe, it, expect } from "vitest";

import {
  AI_INFERENCE_PROVIDERS,
  PAY_PER_USE_PROVIDERS,
  connectorBillsExternally,
  connectorRequiresPaidPlan,
} from "@/lib/connector-tiers";
import { ENTITLEMENTS } from "@/lib/entitlements";

/**
 * These lock in the policy split, not the current contents of the lists.
 *
 * The failure this suite exists to catch: someone adds an AI provider to
 * PAY_PER_USE_PROVIDERS (the obvious-looking list) and forgets
 * AI_INFERENCE_PROVIDERS, silently opening a BYOK-LLM back door on the Free
 * plan — the runtime's `_enforce_agent_model_access` refuses a non-platform key
 * there, so a free user calling OpenAI through a *connector* would bypass a gate
 * we enforce everywhere else.
 */
describe("connector tier policy", () => {
  it("gates AI-inference connectors and nothing else", () => {
    for (const provider of AI_INFERENCE_PROVIDERS) {
      expect(connectorRequiresPaidPlan(provider)).toBe(true);
    }
    for (const provider of ["stripe", "twilio", "awss3", "sendgrid", "slack", "gmail"]) {
      expect(connectorRequiresPaidPlan(provider)).toBe(false);
    }
  });

  it("does not gate pinecone — vector storage, no inference", () => {
    // Deliberate: pinecone is an AI-adjacent vendor whose connector exposes only
    // query_index/upsert_vectors. Gating by vendor rather than by capability is
    // the mistake this asserts against.
    expect(PAY_PER_USE_PROVIDERS.has("pinecone")).toBe(true);
    expect(connectorRequiresPaidPlan("pinecone")).toBe(false);
  });

  it("keeps every gated provider inside the pay-per-use set", () => {
    // An inference connector runs on a user-supplied key, so it bills their
    // account by definition. A gated provider missing here would lose its
    // "billed to your account" label in the UI.
    for (const provider of AI_INFERENCE_PROVIDERS) {
      expect(PAY_PER_USE_PROVIDERS.has(provider)).toBe(true);
    }
  });

  it("treats billing-externally as a label, not a gate", () => {
    expect(connectorBillsExternally("stripe")).toBe(true);
    expect(connectorRequiresPaidPlan("stripe")).toBe(false);
    expect(connectorBillsExternally("slack")).toBe(false);
  });

  it("tolerates untrimmed provider ids from route params", () => {
    expect(connectorRequiresPaidPlan(" openai ")).toBe(true);
    expect(connectorBillsExternally(" stripe ")).toBe(true);
  });

  it("keeps the gate aligned with the BYOK entitlement it protects", () => {
    // checkConnectorAccess gates on `byok`. If Free ever gains BYOK, the
    // connector gate silently opens too — that should be a deliberate change,
    // so make it break here first.
    expect(ENTITLEMENTS.free.byok).toBe(false);
    expect(ENTITLEMENTS.plus.byok).toBe(true);
    expect(ENTITLEMENTS.pro.byok).toBe(true);
    expect(ENTITLEMENTS.builder.byok).toBe(true);
    expect(ENTITLEMENTS.unlimited.byok).toBe(true);
  });
});

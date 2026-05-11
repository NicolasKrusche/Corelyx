// EU compliance pre-filter for Genesis — identifies relevant EU regulations
// before workflow generation so Genesis can design the schema accordingly.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getProviderBaseURL } from "@/lib/genesis/request";
import type { GenesisApiKeyRow } from "@/lib/genesis/request";

// Prefer fast/cheap models for the compliance filter — output is small and
// latency matters more than raw capability here.
const COMPLIANCE_FILTER_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  google: "gemini-1.5-flash",
};

const EU_COMPLIANCE_FILTER_SYSTEM_PROMPT = `You are an EU regulatory compliance specialist. Analyze the described automation workflow and identify ONLY the EU regulations that directly and materially apply to it.

Evaluate relevance from: GDPR, EU AI Act, NIS2 Directive, DORA (Digital Operational Resilience Act), ePrivacy Directive, Data Act, DSA (Digital Services Act), DGA (Data Governance Act), PSD2/PSD3, CSRD.

OUTPUT FORMAT — return a concise bullet list where each bullet is:
• [Regulation, article if applicable]: [Specific obligation this creates for this workflow]

RULES:
- Only include regulations with a direct, practical impact on how this workflow must be designed or operated
- Cite specific articles where applicable (e.g., GDPR Art. 6, Art. 13, Art. 17)
- Do not explain regulations generally — state only the concrete obligation that applies here
- Do not include regulations that apply in theory but have no design consequence for this specific workflow
- If no EU regulation directly applies, respond with exactly: NONE`;

function buildEuComplianceFilterMessage(description: string): string {
  return `Analyze this automation workflow for applicable EU regulatory requirements:\n\n<workflow_description>\n${description}\n</workflow_description>\n\nList only the EU regulations and specific obligations that directly affect how this workflow must be designed or operated.`;
}

/**
 * Runs the EU compliance pre-filter against the workflow description.
 * Returns a bullet list of relevant EU obligations, or null if none apply
 * or the call fails. Never throws — compliance filter is non-blocking.
 */
export async function runEuComplianceFilter(
  description: string,
  keyRow: GenesisApiKeyRow,
  apiKey: string
): Promise<string | null> {
  const filterModel =
    COMPLIANCE_FILTER_MODELS[keyRow.provider] ?? "gpt-4o-mini";
  const userMessage = buildEuComplianceFilterMessage(description);

  try {
    let response = "";

    if (keyRow.provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: filterModel,
        max_tokens: 600,
        temperature: 0,
        system: EU_COMPLIANCE_FILTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      response =
        msg.content[0]?.type === "text"
          ? (msg.content[0] as { type: "text"; text: string }).text
          : "";
    } else {
      const baseURL = getProviderBaseURL(keyRow.provider);
      const openai = new OpenAI({
        apiKey,
        ...(baseURL && { baseURL }),
        timeout: 30_000,
      });
      const completion = await openai.chat.completions.create({
        model: filterModel,
        max_tokens: 600,
        messages: [
          { role: "system", content: EU_COMPLIANCE_FILTER_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });
      response = completion.choices[0]?.message?.content ?? "";
    }

    const trimmed = response.trim();
    if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
    return trimmed;
  } catch (err) {
    console.warn(
      "[genesis] EU compliance filter failed:",
      (err as Error).message
    );
    return null;
  }
}

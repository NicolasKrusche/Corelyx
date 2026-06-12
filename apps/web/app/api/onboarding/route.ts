import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeTextForLlm } from "@/lib/privacy/pii";
import {
  ACCOUNT_TYPE_IDS,
  GOAL_IDS,
  INDUSTRY_IDS,
  ROLE_IDS,
  TEAM_SIZE_IDS,
  TOOL_IDS,
  type AccountType,
} from "@/lib/onboarding/options";
import {
  buildAiContext,
  buildSuggestions,
  type OnboardingAnswers,
} from "@/lib/onboarding/profile";

const enumOf = (ids: string[]) => z.string().refine((v) => ids.includes(v), "Unknown option");

const OnboardingBodySchema = z.object({
  account_type: enumOf(ACCOUNT_TYPE_IDS).nullable().optional(),
  team_size: enumOf(TEAM_SIZE_IDS).nullable().optional(),
  industry: enumOf(INDUSTRY_IDS).nullable().optional(),
  role: enumOf(ROLE_IDS).nullable().optional(),
  goals: z.array(enumOf(GOAL_IDS)).max(GOAL_IDS.length).optional(),
  tools: z.array(enumOf(TOOL_IDS)).max(TOOL_IDS.length).optional(),
  current_processes: z.string().max(2000).nullable().optional(),
  automation_wishes: z.string().max(2000).nullable().optional(),
  profile_consent: z.boolean().optional(),
});

// POST /api/onboarding — persist the extended onboarding answers and return
// personalized workflow suggestions.
//
// GDPR boundary (mirrors the DB CHECK constraint in 20260612120000):
//   - Categorical catalog keys are always stored (legitimate interest).
//   - Free-text answers and the derived ai_context summary are stored ONLY when
//     the user gave explicit profile consent; without it they are dropped
//     server-side regardless of what the client sent.
//   - Free text is PII-sanitized before the AI summary is derived from it.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  if (!(await rateLimit(`onboarding:${user.id}`, 10, 60_000))) {
    return apiError("Too many requests. Please try again in a moment.", 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = OnboardingBodySchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid onboarding answers.", 400);

  const consent = parsed.data.profile_consent === true;
  const dedupe = (values: string[] | undefined) => Array.from(new Set(values ?? []));

  const answers: OnboardingAnswers = {
    account_type: (parsed.data.account_type ?? null) as AccountType | null,
    team_size: parsed.data.team_size ?? null,
    industry: parsed.data.industry ?? null,
    role: parsed.data.role ?? null,
    goals: dedupe(parsed.data.goals),
    tools: dedupe(parsed.data.tools),
    // Free text only survives with consent — and only PII-sanitized.
    current_processes: consent
      ? sanitizeTextForLlm(parsed.data.current_processes?.trim() ?? "").value || null
      : null,
    automation_wishes: consent
      ? sanitizeTextForLlm(parsed.data.automation_wishes?.trim() ?? "").value || null
      : null,
    profile_consent: consent,
  };

  const aiContext = buildAiContext(answers);

  const service = createServiceClient() as unknown as { from(table: string): any };
  const { error } = await service.from("onboarding_profiles").upsert(
    {
      user_id: user.id,
      account_type: answers.account_type,
      team_size: answers.team_size,
      industry: answers.industry,
      role: answers.role,
      goals: answers.goals,
      tools: answers.tools,
      current_processes: answers.current_processes,
      automation_wishes: answers.automation_wishes,
      profile_consent: consent,
      consent_at: consent ? new Date().toISOString() : null,
      ai_context: aiContext,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return apiError("Could not save your onboarding answers. Please try again.", 500);

  return NextResponse.json({ suggestions: buildSuggestions(answers) });
}

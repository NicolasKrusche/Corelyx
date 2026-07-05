import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requestHasValidInternalServiceToken } from "@/lib/internal-auth";
import { sweepDueCronTriggers } from "@/lib/cron-sweep";
import { recordSecurityEvent } from "@/lib/security/sentinel";

// A sweep may dispatch several runs in sequence; give it room beyond the
// default function timeout.
export const maxDuration = 60;

/**
 * POST /api/internal/cron/tick
 *
 * Called every 60s by the Python runtime's scheduler heartbeat. Fires all due
 * cron triggers via the shared sweep. This is the primary cron path — it works
 * without any third-party scheduler and stays reachable during maintenance
 * mode (all /api/internal/ routes are maintenance-exempt).
 *
 * Secured by a scoped internal service token (audience next:cron:tick).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (
    !requestHasValidInternalServiceToken(request.headers, "next:cron:tick", {
      method: "POST",
      path: new URL(request.url).pathname,
      body: rawBody,
    })
  ) {
    await recordSecurityEvent({
      event: "internal.auth_failed",
      severity: "warning",
      scopeType: "route",
      scopeId: "/api/internal/cron/tick",
    });
    return apiError("Unauthorized", 401);
  }

  try {
    const result = await sweepDueCronTriggers(console);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron-tick] sweep failed:", error);
    return apiError("Cron sweep failed", 500);
  }
}

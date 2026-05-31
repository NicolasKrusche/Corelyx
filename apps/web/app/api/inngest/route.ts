import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { inngest } from "@/lib/inngest";
import { cronRunner } from "@/lib/inngest/cron-runner";
import { approvalNotifier } from "@/lib/inngest/approval-notifier";
import { approvalTimeout } from "@/lib/inngest/approval-timeout";
import { dataRetentionPurge } from "@/lib/inngest/data-retention";
import { securityMonitor } from "@/lib/inngest/security-monitor";
import { gmailWatchRenewer } from "@/lib/inngest/gmail-watch-renewer";

/**
 * Inngest serve endpoint — handles all function registrations + event delivery.
 * In dev, Inngest Dev Server calls this. In prod, Inngest Cloud calls this.
 * Production requests are rejected unless INNGEST_SIGNING_KEY is configured.
 */
const handlers = serve({
  client: inngest,
  functions: [cronRunner, approvalNotifier, approvalTimeout, dataRetentionPurge, securityMonitor, gmailWatchRenewer],
});

const productionEnvNames = ["NODE_ENV", "VERCEL_ENV", "APP_ENV"] as const;

function requireSigningKeyInProduction(): Response | null {
  const isProductionEnvironment = productionEnvNames.some(
    (name) => process.env[name] === "production"
  );
  const signingKey = process.env.INNGEST_SIGNING_KEY?.trim();
  if (!isProductionEnvironment || signingKey) return null;

  return Response.json(
    { error: "INNGEST_SIGNING_KEY is required in production for Inngest request verification" },
    { status: 500 }
  );
}

type RouteContext = { params: Promise<Record<string, string>> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireSigningKeyInProduction();
  if (guard) return guard;
  return handlers.GET(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireSigningKeyInProduction();
  if (guard) return guard;
  return handlers.POST(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireSigningKeyInProduction();
  if (guard) return guard;
  return handlers.PUT(request, context);
}

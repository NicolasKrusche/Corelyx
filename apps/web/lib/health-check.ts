/**
 * Enhanced health check with dependency verification.
 */

import { createServiceClient } from "@/lib/api";
import { getRuntimeUrl } from "@/lib/runtime-url";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheckResult;
    supabase_realtime?: HealthCheckResult;
    runtime?: HealthCheckResult;
    litellm_proxy?: HealthCheckResult;
    inngest?: HealthCheckResult;
  };
}

interface HealthCheckResult {
  status: "pass" | "fail" | "warn";
  responseTimeMs: number;
  message?: string;
  lastError?: string;
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const db = createServiceClient();
    // Head-only count verifies connectivity without requiring any rows or a
    // non-existent synthetic "count" column.
    const { error } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true });
    
    if (error) {
      return {
        status: "fail",
        responseTimeMs: Date.now() - start,
        message: "Database query failed",
        lastError: error.message,
      };
    }
    
    return {
      status: "pass",
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      status: "fail",
      responseTimeMs: Date.now() - start,
      message: "Database connection failed",
      lastError: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

async function checkSupabaseRealtime(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const db = createServiceClient();
    // Check the Supabase data API. Realtime transport health is not exposed by
    // the client, so this check must not silently claim success on query errors.
    const { error } = await db
      .from("profiles")
      .select("id")
      .limit(1);
    
    if (error) {
      return {
        status: "warn",
        responseTimeMs: Date.now() - start,
        message: "Supabase data API query failed",
        lastError: error.message,
      };
    }

    return {
      status: "pass",
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      status: "warn",
      responseTimeMs: Date.now() - start,
      message: "Supabase check failed",
      lastError: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

async function checkInngestConfiguration(): Promise<HealthCheckResult> {
  const start = Date.now();
  const isProduction = ["NODE_ENV", "VERCEL_ENV", "APP_ENV"].some(
    (name) => process.env[name] === "production",
  );
  if (!isProduction) {
    return {
      status: "pass",
      responseTimeMs: Date.now() - start,
      message: "Development mode",
    };
  }

  const missing = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    return {
      status: "fail",
      responseTimeMs: Date.now() - start,
      message: "Inngest production configuration is incomplete",
      lastError: `Missing ${missing.join(", ")}`,
    };
  }

  return { status: "pass", responseTimeMs: Date.now() - start };
}

async function checkRuntime(): Promise<HealthCheckResult> {
  const start = Date.now();
  const runtimeUrl = getRuntimeUrl();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${runtimeUrl}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return {
        status: "fail",
        responseTimeMs: Date.now() - start,
        message: `Runtime returned HTTP ${response.status}`,
      };
    }
    
    const payload = (await response.json().catch(() => null)) as { status?: unknown } | null;
    if (payload?.status !== "ok") {
      return {
        status: "fail",
        responseTimeMs: Date.now() - start,
        message: "Runtime health response was not ok",
        lastError: payload ? JSON.stringify(payload) : "Invalid JSON response",
      };
    }

    return {
      status: "pass",
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      status: "fail",
      responseTimeMs: Date.now() - start,
      message: "Runtime unreachable",
      lastError: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

async function checkLiteLLMProxy(): Promise<HealthCheckResult> {
  const start = Date.now();
  const proxyUrl = process.env.LITELLM_PROXY_URL;
  
  if (!proxyUrl) {
    // LiteLLM is optional — the runtime falls back to direct provider URLs.
    // Not configuring it is a valid deployment choice, not a warning.
    return {
      status: "pass",
      responseTimeMs: 0,
      message: "Not configured (optional — runtime uses direct provider URLs)",
    };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${proxyUrl}/health`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.LITELLM_PROXY_KEY || ""}`,
      },
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return {
        status: "fail",
        responseTimeMs: Date.now() - start,
        message: `LiteLLM proxy returned HTTP ${response.status}`,
      };
    }
    
    return {
      status: "pass",
      responseTimeMs: Date.now() - start,
    };
  } catch (e) {
    return {
      status: "fail",
      responseTimeMs: Date.now() - start,
      message: "LiteLLM proxy unreachable",
      lastError: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, supabaseRealtime, runtime, litellmProxy, inngest] = await Promise.all([
    checkDatabase(),
    checkSupabaseRealtime(),
    checkRuntime(),
    checkLiteLLMProxy(),
    checkInngestConfiguration(),
  ]);
  
  // Determine overall status
  const failures = [
    database,
    supabaseRealtime,
    runtime,
    litellmProxy,
    inngest,
  ].filter((c) => c?.status === "fail").length;
  
  const warnings = [
    database,
    supabaseRealtime,
    runtime,
    litellmProxy,
    inngest,
  ].filter((c) => c?.status === "warn").length;
  
  let status: HealthStatus["status"] = "healthy";
  if (failures > 0) {
    status = "unhealthy";
  } else if (warnings > 0) {
    status = "degraded";
  }
  
  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
    checks: {
      database,
      supabase_realtime: supabaseRealtime,
      runtime,
      litellm_proxy: litellmProxy,
      inngest,
    },
  };
}

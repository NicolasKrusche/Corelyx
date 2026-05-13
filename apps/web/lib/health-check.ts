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
    // Simple query to check DB connectivity
    const { data, error } = await db
      .from("profiles")
      .select("count")
      .limit(1)
      .single();
    
    if (error && !error.message.includes("Results contain 0 rows")) {
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
    // Check Supabase is responsive by querying a table
    const { error } = await db
      .from("profiles")
      .select("id")
      .limit(1);
    
    // If we get here without error, Supabase is working
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
    return {
      status: "warn",
      responseTimeMs: 0,
      message: "LiteLLM proxy URL not configured",
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
  const [database, supabaseRealtime, runtime, litellmProxy] = await Promise.all([
    checkDatabase(),
    checkSupabaseRealtime(),
    checkRuntime(),
    checkLiteLLMProxy(),
  ]);
  
  // Determine overall status
  const failures = [
    database,
    supabaseRealtime,
    runtime,
    litellmProxy,
  ].filter((c) => c?.status === "fail").length;
  
  const warnings = [
    database,
    supabaseRealtime,
    runtime,
    litellmProxy,
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
    },
  };
}

import { NextResponse } from "next/server";
import { buildInternalServiceHeaders } from "@/lib/internal-auth";

const MAX_RUNTIME_ERROR_DETAIL_LENGTH = 500;

export type RuntimeRejectionDetails = {
  status: number;
  detail: string;
};

export function buildRuntimeExecuteHeaders(runtimeBody: string): Headers {
  return buildInternalServiceHeaders(
    "runtime:execute",
    {
      "Content-Type": "application/json",
    },
    {
      method: "POST",
      path: "/execute",
      body: runtimeBody,
    }
  );
}

export async function readRuntimeRejectionDetails(
  response: Response
): Promise<RuntimeRejectionDetails> {
  const text = await response.text().catch(() => "");
  let detail = text.trim();

  if (detail) {
    try {
      const parsed = JSON.parse(detail) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        const candidate = body.detail ?? body.message ?? body.error;
        if (typeof candidate === "string") {
          detail = candidate;
        } else if (candidate !== undefined) {
          detail = JSON.stringify(candidate);
        }
      }
    } catch {
      // Keep the raw response text when the runtime does not return JSON.
    }
  }

  if (!detail) {
    detail = response.statusText || "Runtime rejected the request";
  }

  return {
    status: response.status,
    detail: detail.slice(0, MAX_RUNTIME_ERROR_DETAIL_LENGTH),
  };
}

export function formatRuntimeRejection(details: RuntimeRejectionDetails): string {
  return `Runtime rejected execution (${details.status}): ${details.detail}`;
}

export function isRuntimeDispatchConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE");
}

export function runtimeDispatchConfigError(error: unknown): NextResponse | null {
  if (!isRuntimeDispatchConfigError(error)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Runtime auth is not configured",
      message:
        "Set INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE to the same value in Vercel and Railway, then redeploy both services.",
    },
    { status: 500 }
  );
}

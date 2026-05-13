import { NextResponse } from "next/server";
import { buildInternalServiceHeaders } from "@/lib/internal-auth";

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

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

/**
 * GET /api/test-error
 * Throws an error to verify Sentry integration is working.
 * Only works when SENTRY_DSN is configured.
 *
 * Usage:
 *   curl http://localhost:3000/api/test-error
 *   curl http://localhost:3000/api/test-error?type=capture
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "capture") {
    // Test explicit captureException (no throw)
    Sentry.captureException(
      new Error("Sentry test: explicit captureException from /api/test-error"),
    );
    return NextResponse.json({
      ok: true,
      message:
        "Error captured and sent to Sentry via captureException. Check your Sentry dashboard.",
    });
  }

  if (type === "message") {
    // Test captureMessage
    Sentry.captureMessage(
      "Sentry test: captureMessage from /api/test-error",
      "warning",
    );
    return NextResponse.json({
      ok: true,
      message:
        "Message captured and sent to Sentry via captureMessage. Check your Sentry dashboard.",
    });
  }

  // Default: throw an unhandled error
  throw new Error(
    "Sentry test: unhandled error from /api/test-error. This error should appear in your Sentry dashboard.",
  );
}

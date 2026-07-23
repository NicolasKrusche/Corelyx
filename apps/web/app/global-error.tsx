"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { PersistentAiDisclosure } from "@/components/ai-transparency";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold text-red-500">Something went wrong</h2>
        <p className="max-w-sm text-center text-sm">
          {friendlyErrorMessage(error.message, "The page hit a problem. Please try again.")}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
        <PersistentAiDisclosure
          title="AI disclosure"
          message="You are interacting with AI. AI-generated output can be inaccurate; review important results."
        />
      </body>
    </html>
  );
}

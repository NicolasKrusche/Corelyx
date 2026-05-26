"use client";

import { friendlyErrorMessage } from "@/lib/friendly-errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      </body>
    </html>
  );
}

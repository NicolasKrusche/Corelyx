import { CronExpressionParser } from "cron-parser";

/**
 * Corelyx schedules use standard five-field cron syntax (minute through
 * weekday). cron-parser also accepts a leading seconds field, so enforce the
 * product contract before asking the library to parse the expression.
 */
export function hasExactlyFiveCronFields(expression: unknown): expression is string {
  return (
    typeof expression === "string" &&
    expression.trim().split(/\s+/).length === 5
  );
}

/** Return the next occurrence, or null for an invalid/non-five-field schedule. */
export function nextFiveFieldCronRun(
  expression: unknown,
  timezone: unknown,
  currentDate: Date = new Date()
): string | null {
  if (!hasExactlyFiveCronFields(expression)) return null;
  const tz = typeof timezone === "string" && timezone.trim() ? timezone : "UTC";
  try {
    return CronExpressionParser.parse(expression.trim(), { currentDate, tz })
      .next()
      .toISOString();
  } catch {
    return null;
  }
}

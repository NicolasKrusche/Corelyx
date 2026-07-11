import { describe, expect, it } from "vitest";
import {
  hasExactlyFiveCronFields,
  nextFiveFieldCronRun,
} from "@/lib/cron-expression";

describe("five-field cron contract", () => {
  it("accepts standard five-field schedules with flexible whitespace", () => {
    expect(hasExactlyFiveCronFields("  0   9  * * 1-5 ")).toBe(true);
    expect(
      nextFiveFieldCronRun(
        "0 9 * * 1-5",
        "Europe/Vienna",
        new Date("2026-07-05T10:00:00.000Z")
      )
    ).toBe("2026-07-06T07:00:00.000Z");
  });

  it("rejects seconds-field, malformed, and invalid-timezone schedules", () => {
    expect(hasExactlyFiveCronFields("0 0 9 * * *")).toBe(false);
    expect(nextFiveFieldCronRun("0 0 9 * * *", "UTC")).toBeNull();
    expect(nextFiveFieldCronRun("not a schedule", "UTC")).toBeNull();
    expect(nextFiveFieldCronRun("0 9 * * *", "Not/A_Timezone")).toBeNull();
  });
});

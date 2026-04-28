import { describe, expect, it } from "vitest";

import { sanitizeTextForLlm, sanitizeValueForLlm } from "../pii";

describe("PII sanitizer", () => {
  it("redacts common direct identifiers from LLM-bound text", () => {
    const result = sanitizeTextForLlm(
      "Email ada@example.com or call +1 415-555-0199. Card 4242 4242 4242 4242. IP 192.168.0.1."
    );

    expect(result.value).toContain("[REDACTED_EMAIL]");
    expect(result.value).toContain("[REDACTED_PHONE]");
    expect(result.value).toContain("[REDACTED_CREDIT_CARD]");
    expect(result.value).toContain("[REDACTED_IP_ADDRESS]");
    expect(result.value).not.toContain("ada@example.com");
    expect(result.value).not.toContain("4242 4242 4242 4242");
    expect(result.redacted).toBe(true);
  });

  it("redacts secrets, national IDs, and IBANs", () => {
    const result = sanitizeTextForLlm(
      "token=sk-12345678901234567890, ssn 123-45-6789, iban DE89370400440532013000"
    );

    expect(result.value).toContain("token=[REDACTED_SECRET]");
    expect(result.value).toContain("[REDACTED_NATIONAL_ID]");
    expect(result.value).toContain("[REDACTED_IBAN]");
    expect(result.value).not.toContain("sk-12345678901234567890");
    expect(result.value).not.toContain("123-45-6789");
    expect(result.value).not.toContain("DE89370400440532013000");
  });

  it("does not redact arbitrary non-Luhn long numbers as credit cards", () => {
    const result = sanitizeTextForLlm("Keep support ticket 1234567890123 in the prompt.");

    expect(result.value).toContain("1234567890123");
    expect(result.redacted).toBe(false);
  });

  it("sanitizes nested values and object keys without mutating the original value", () => {
    const original = {
      "owner: jane@example.com": {
        recipients: ["jane@example.com", "ops@example.com"],
        meta: { phone: "(415) 555-0199" },
      },
    };

    const result = sanitizeValueForLlm(original);

    expect(JSON.stringify(result.value)).toContain("[REDACTED_EMAIL]");
    expect(JSON.stringify(result.value)).toContain("[REDACTED_PHONE]");
    expect(JSON.stringify(result.value)).not.toContain("jane@example.com");
    expect(original["owner: jane@example.com"].recipients[0]).toBe("jane@example.com");
  });
});

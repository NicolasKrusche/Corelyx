import { describe, expect, it } from "vitest";

import { PseudonymizationSession, sanitizeTextForLlm, sanitizeValueForLlm } from "../pii";

describe("PII sanitizer", () => {
  it("pseudonymizes common direct identifiers in LLM-bound text", () => {
    const result = sanitizeTextForLlm(
      "Email ada@example.com or call +1 415-555-0199. Card 4242 4242 4242 4242. IP 192.168.0.1."
    );

    expect(result.value).toContain("[EMAIL_1]");
    expect(result.value).toContain("[PHONE_1]");
    expect(result.value).toContain("[CREDIT_CARD_1]");
    expect(result.value).toContain("[IP_ADDRESS_1]");
    expect(result.value).not.toContain("ada@example.com");
    expect(result.value).not.toContain("4242 4242 4242 4242");
    expect(result.redacted).toBe(true);
  });

  it("redacts secrets destructively and pseudonymizes national IDs and IBANs", () => {
    const result = sanitizeTextForLlm(
      "token=sk-12345678901234567890, ssn 123-45-6789, iban DE89370400440532013000"
    );

    expect(result.value).toContain("token=[REDACTED_SECRET]");
    expect(result.value).toContain("[NATIONAL_ID_1]");
    expect(result.value).toContain("[IBAN_1]");
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

    expect(JSON.stringify(result.value)).toContain("[EMAIL_1]");
    expect(JSON.stringify(result.value)).toContain("[PHONE_1]");
    expect(JSON.stringify(result.value)).not.toContain("jane@example.com");
    expect(original["owner: jane@example.com"].recipients[0]).toBe("jane@example.com");
  });
});

describe("PseudonymizationSession", () => {
  it("gives the same value a stable placeholder across calls", () => {
    const session = new PseudonymizationSession();
    const first = session.sanitizeText("Mail ada@example.com today.");
    const second = session.sanitizeText("Reply: ada@example.com agreed; cc bob@example.com.");

    expect(first.value).toContain("[EMAIL_1]");
    expect(second.value).toContain("[EMAIL_1]");
    expect(second.value).toContain("[EMAIL_2]");
  });

  it("rehydrates text and nested values", () => {
    const session = new PseudonymizationSession();
    session.sanitizeText("From ada@example.com, phone +49 30 1234567890.");

    const text = session.rehydrateText("Dear [EMAIL_1], we will call [PHONE_1].");
    expect(text).toContain("ada@example.com");
    expect(text).toContain("+49 30 1234567890");

    const value = session.rehydrateValue({ to: "[EMAIL_1]", steps: ["notify [EMAIL_1]"] });
    expect(value.to).toBe("ada@example.com");
    expect(value.steps).toEqual(["notify ada@example.com"]);
  });

  it("leaves unknown placeholders alone", () => {
    const session = new PseudonymizationSession();
    session.sanitizeText("ada@example.com");
    expect(session.rehydrateText("send to [EMAIL_7]")).toBe("send to [EMAIL_7]");
  });

  it("never rehydrates secrets", () => {
    const session = new PseudonymizationSession();
    const result = session.sanitizeText("api_key=sk-12345678901234567890abcd");

    expect(result.value).toContain("[REDACTED_SECRET]");
    expect(session.rehydrateText("leak [REDACTED_SECRET] now")).toBe("leak [REDACTED_SECRET] now");
  });

  it("round-trips a sanitized structure back to the original", () => {
    const session = new PseudonymizationSession();
    const original = {
      customer: "ada@example.com",
      card: "4242 4242 4242 4242",
      note: "ticket 1234567890123 stays",
    };
    const sanitized = session.sanitizeValue(original);
    expect(JSON.stringify(sanitized.value)).not.toContain("ada@example.com");
    expect(session.rehydrateValue(sanitized.value)).toEqual(original);
  });
});

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

describe("known-value pseudonymization (Genesis V2 introspection)", () => {
  it("registers user-named taxonomy and substitutes it in free text", () => {
    const session = new PseudonymizationSession();
    const placeholder = session.registerKnownValue("gmail_label", "Invoices");

    expect(placeholder).toBe("[GMAIL_LABEL_1]");
    // Same value, same category → same placeholder.
    expect(session.registerKnownValue("gmail_label", "Invoices")).toBe(placeholder);

    const grounded = session.applyKnownValues("Move mail with the invoices label to archive");
    expect(grounded).toContain("[GMAIL_LABEL_1]");
    expect(grounded).not.toMatch(/invoices/i);
  });

  it("rehydrates known-value placeholders back to the raw name", () => {
    const session = new PseudonymizationSession();
    session.registerKnownValue("notion_database", "CRM Leads");

    const schemaText = '{"operation_params":{"database":"[NOTION_DATABASE_1]"}}';
    expect(session.rehydrateText(schemaText)).toContain("CRM Leads");
  });

  it("prefers the longest match and never rewrites inside placeholders", () => {
    const session = new PseudonymizationSession();
    session.registerKnownValue("slack_channel", "sales");
    session.registerKnownValue("slack_channel", "sales-eu");
    // A registered name matching a placeholder's category word must not
    // corrupt already-substituted placeholders.
    session.registerKnownValue("slack_channel", "channel");

    const grounded = session.applyKnownValues("post to sales-eu then sales channel");
    expect(grounded).toContain("[SLACK_CHANNEL_2]"); // sales-eu
    expect(grounded).toContain("[SLACK_CHANNEL_1]"); // sales
    expect(grounded).not.toContain("[SLACK_[SLACK_");
    expect(session.rehydrateText(grounded)).toContain("sales-eu");
  });

  it("skips substitution for values too short to match safely", () => {
    const session = new PseudonymizationSession();
    session.registerKnownValue("gmail_label", "To");

    expect(session.applyKnownValues("Send it to me")).toBe("Send it to me");
    // Rehydration still works when the model copies the placeholder from the
    // capability listing.
    expect(session.rehydrateText("[GMAIL_LABEL_1]")).toBe("To");
  });

  it("leaves unknown placeholders untouched on rehydration", () => {
    const session = new PseudonymizationSession();
    session.registerKnownValue("gmail_label", "Invoices");

    expect(session.rehydrateText("[GMAIL_LABEL_99] [MADE_UP_1]")).toBe(
      "[GMAIL_LABEL_99] [MADE_UP_1]"
    );
  });

  it("keeps regex-detected PII and known values in one placeholder namespace", () => {
    const session = new PseudonymizationSession();
    const sanitized = session.sanitizeText("Contact ada@example.com");
    session.registerKnownValue("gmail_label", "Invoices");

    const roundTripped = session.rehydrateText(
      `${sanitized.value} filed under [GMAIL_LABEL_1]`
    );
    expect(roundTripped).toContain("ada@example.com");
    expect(roundTripped).toContain("Invoices");
  });
});

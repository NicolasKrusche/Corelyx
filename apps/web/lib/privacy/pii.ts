export type PiiRedactionKind =
  | "credit_card"
  | "email"
  | "iban"
  | "ip_address"
  | "national_id"
  | "phone"
  | "secret";

export type PiiRedactionCounts = Partial<Record<PiiRedactionKind, number>>;

export type PiiSanitizationResult<T> = {
  value: T;
  redactions: PiiRedactionCounts;
  redacted: boolean;
};

// Secrets are destructively redacted and never rehydrated: a credential must
// not be able to round-trip through a (possibly prompt-injected) model back
// into generated schemas or outputs. All other kinds are reversible workflow
// data — the model sees a stable numbered placeholder and the real value is
// substituted back on our side (see PseudonymizationSession).
export const SECRET_PLACEHOLDER = "[REDACTED_SECRET]";

const REVERSIBLE_KINDS = [
  "email",
  "iban",
  "national_id",
  "ip_address",
  "phone",
  "credit_card",
] as const;

type ReversibleKind = (typeof REVERSIBLE_KINDS)[number];

const SECRET_ASSIGNMENT_REGEX =
  /\b((?:api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{12,})(["']?)/gi;
const BEARER_TOKEN_REGEX = /\b(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi;
const PREFIXED_SECRET_REGEX =
  /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|glpat|github_pat|xox[baprs]?)[-_][A-Za-z0-9_=-]{12,}\b/gi;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi;
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
const NATIONAL_ID_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const IPV4_REGEX =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const INTERNATIONAL_PHONE_REGEX = /(?:\+|00)\d[\d\s().-]{7,}\d/g;
const US_PHONE_REGEX = /(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;

// Matches any placeholder this module can emit — regex kinds ([EMAIL_3]) and
// registered known-value categories ([GMAIL_LABEL_2]). Rehydration only
// substitutes placeholders the session actually issued (map lookup), so the
// broader pattern cannot leak anything.
const PLACEHOLDER_REGEX = /\[([A-Z][A-Z0-9_]*)_(\d+)\]/g;

// Known values shorter than this are too likely to collide with ordinary
// words ("To", "Do") to substitute in free text. They still get a placeholder
// for the capability listing and rehydration.
const MIN_KNOWN_VALUE_SUBSTITUTION_LENGTH = 3;

function addCount(redactions: PiiRedactionCounts, kind: PiiRedactionKind, count: number) {
  if (count > 0) redactions[kind] = (redactions[kind] ?? 0) + count;
}

function luhnCheck(digits: string) {
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum > 0 && sum % 10 === 0;
}

export function mergePiiRedactions(...items: Array<PiiRedactionCounts | null | undefined>): PiiRedactionCounts {
  const merged: PiiRedactionCounts = {};

  for (const item of items) {
    if (!item) continue;
    for (const [kind, count] of Object.entries(item) as Array<[PiiRedactionKind, number | undefined]>) {
      addCount(merged, kind, count ?? 0);
    }
  }

  return merged;
}

export function hasPiiRedactions(redactions: PiiRedactionCounts) {
  return Object.values(redactions).some((count) => (count ?? 0) > 0);
}

/**
 * Reversible, request-scoped PII pseudonymization.
 *
 * Each unique raw value gets one stable numbered placeholder for the lifetime
 * of the session ("max@firma.de" → "[EMAIL_1]" everywhere), so the model can
 * reason about identity across prompt parts. The mapping lives only in this
 * object — it is never persisted and never leaves the server — and
 * `rehydrate*` substitutes the real values back into model output (e.g. a
 * generated workflow schema) before it is used.
 *
 * Secrets are the exception: destructively redacted, never mapped.
 */
export class PseudonymizationSession {
  private placeholderByValue = new Map<string, string>();
  private valueByPlaceholder = new Map<string, string>();
  private counters = new Map<string, number>();
  // Known values registered via registerKnownValue, for applyKnownValues.
  private knownValues: Array<{ raw: string; placeholder: string }> = [];

  private placeholderFor(kind: ReversibleKind, raw: string): string {
    const key = `${kind}\x00${raw}`;
    const existing = this.placeholderByValue.get(key);
    if (existing !== undefined) return existing;
    const number = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, number);
    const placeholder = `[${kind.toUpperCase()}_${number}]`;
    this.placeholderByValue.set(key, placeholder);
    this.valueByPlaceholder.set(placeholder, raw);
    return placeholder;
  }

  private subReversible(text: string, kind: ReversibleKind, regex: RegExp) {
    let count = 0;
    const value = text.replace(regex, (match) => {
      count += 1;
      return this.placeholderFor(kind, match);
    });
    return { value, count };
  }

  private subSecretAssignments(text: string) {
    let count = 0;
    const assigned = text.replace(SECRET_ASSIGNMENT_REGEX, (_match, prefix: string, _secret: string, suffix: string) => {
      count += 1;
      return `${prefix}${SECRET_PLACEHOLDER}${suffix}`;
    });
    const bearer = assigned.replace(BEARER_TOKEN_REGEX, (_match, prefix: string) => {
      count += 1;
      return `${prefix}${SECRET_PLACEHOLDER}`;
    });

    return { value: bearer, count };
  }

  private subCreditCards(text: string) {
    let count = 0;
    const value = text.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19 || !luhnCheck(digits)) {
        return match;
      }

      count += 1;
      return this.placeholderFor("credit_card", match);
    });

    return { value, count };
  }

  sanitizeText(input: string): PiiSanitizationResult<string> {
    let value = input;
    const redactions: PiiRedactionCounts = {};

    const secretAssignments = this.subSecretAssignments(value);
    value = secretAssignments.value;
    addCount(redactions, "secret", secretAssignments.count);

    let prefixedCount = 0;
    value = value.replace(PREFIXED_SECRET_REGEX, () => {
      prefixedCount += 1;
      return SECRET_PLACEHOLDER;
    });
    addCount(redactions, "secret", prefixedCount);

    for (const [kind, regex] of [
      ["email", EMAIL_REGEX],
      ["iban", IBAN_REGEX],
      ["national_id", NATIONAL_ID_REGEX],
      ["ip_address", IPV4_REGEX],
      ["phone", INTERNATIONAL_PHONE_REGEX],
      ["phone", US_PHONE_REGEX],
    ] as const) {
      const result = this.subReversible(value, kind as ReversibleKind, regex);
      value = result.value;
      addCount(redactions, kind, result.count);
    }

    const creditCards = this.subCreditCards(value);
    value = creditCards.value;
    addCount(redactions, "credit_card", creditCards.count);

    return {
      value,
      redactions,
      redacted: hasPiiRedactions(redactions),
    };
  }

  private sanitizeUnknown(value: unknown, seen: WeakSet<object>): PiiSanitizationResult<unknown> {
    if (typeof value === "string") return this.sanitizeText(value);
    if (value === null || typeof value !== "object") {
      return { value, redactions: {}, redacted: false };
    }

    if (seen.has(value)) {
      return { value: "[REDACTED_CIRCULAR_REFERENCE]", redactions: {}, redacted: false };
    }
    seen.add(value);

    if (Array.isArray(value)) {
      const redactions: PiiRedactionCounts = {};
      const sanitized = value.map((item) => {
        const result = this.sanitizeUnknown(item, seen);
        Object.assign(redactions, mergePiiRedactions(redactions, result.redactions));
        return result.value;
      });

      seen.delete(value);
      return {
        value: sanitized,
        redactions,
        redacted: hasPiiRedactions(redactions),
      };
    }

    const redactions: PiiRedactionCounts = {};
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      const sanitizedKey = this.sanitizeText(key);
      const sanitizedValue = this.sanitizeUnknown(item, seen);
      const nextRedactions = mergePiiRedactions(redactions, sanitizedKey.redactions, sanitizedValue.redactions);
      Object.assign(redactions, nextRedactions);
      sanitized[sanitizedKey.value] = sanitizedValue.value;
    }

    seen.delete(value);
    return {
      value: sanitized,
      redactions,
      redacted: hasPiiRedactions(redactions),
    };
  }

  sanitizeValue<T>(value: T): PiiSanitizationResult<T> {
    const result = this.sanitizeUnknown(value, new WeakSet<object>());
    return {
      value: result.value as T,
      redactions: result.redactions,
      redacted: result.redacted,
    };
  }

  /**
   * Register a value known to be user-created (e.g. a Gmail label name or a
   * Notion property name discovered via connection introspection) under a
   * category like "GMAIL_LABEL". Returns the stable placeholder for it — the
   * same raw value in the same category always maps to the same placeholder,
   * and rehydration substitutes it back exactly like regex-detected PII.
   */
  registerKnownValue(category: string, raw: string): string {
    const normalized = category.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
      throw new Error(`Invalid known-value category: ${category}`);
    }
    const key = `${normalized}\x00${raw}`;
    const existing = this.placeholderByValue.get(key);
    if (existing !== undefined) return existing;
    const number = (this.counters.get(normalized) ?? 0) + 1;
    this.counters.set(normalized, number);
    const placeholder = `[${normalized}_${number}]`;
    this.placeholderByValue.set(key, placeholder);
    this.valueByPlaceholder.set(placeholder, raw);
    this.knownValues.push({ raw, placeholder });
    return placeholder;
  }

  /**
   * Replace occurrences of registered known values in free text with their
   * placeholders, so text the user typed ("label it Invoices") aligns with the
   * placeholder identity used in capability listings ([GMAIL_LABEL_1]).
   * Longest-first so overlapping names ("Sales" / "Sales EU") resolve to the
   * more specific match; case-insensitive because users rarely type exact case.
   */
  applyKnownValues(text: string): string {
    if (this.knownValues.length === 0) return text;
    let value = text;
    const candidates = this.knownValues
      .filter((entry) => entry.raw.length >= MIN_KNOWN_VALUE_SUBSTITUTION_LENGTH)
      .sort((a, b) => b.raw.length - a.raw.length);
    for (const { raw, placeholder } of candidates) {
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Word-ish boundaries only where the value starts/ends with a word char,
      // so names like "#sales-data" still match after a space. Underscore is
      // part of the boundary class so a name like "status" can never match
      // inside an already-substituted placeholder such as [NOTION_STATUS_1].
      const prefix = /^[A-Za-z0-9]/.test(raw) ? "(?<![A-Za-z0-9_])" : "";
      const suffix = /[A-Za-z0-9]$/.test(raw) ? "(?![A-Za-z0-9_])" : "";
      value = value.replace(new RegExp(`${prefix}${escaped}${suffix}`, "gi"), placeholder);
    }
    return value;
  }

  /** applyKnownValues over every string in a nested structure (values and keys). */
  applyKnownValuesToValue<T>(value: T): T {
    if (this.knownValues.length === 0) return value;
    return this.applyKnownValuesUnknown(value, new WeakSet<object>()) as T;
  }

  private applyKnownValuesUnknown(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === "string") return this.applyKnownValues(value);
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        return value.map((item) => this.applyKnownValuesUnknown(item, seen));
      }
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        result[this.applyKnownValues(key)] = this.applyKnownValuesUnknown(item, seen);
      }
      return result;
    } finally {
      seen.delete(value);
    }
  }

  /**
   * Substitute known placeholders back to their real values. Placeholders this
   * session never issued (e.g. a model-invented "[EMAIL_99]") are left as-is.
   */
  rehydrateText(text: string): string {
    if (this.valueByPlaceholder.size === 0) return text;
    return text.replace(PLACEHOLDER_REGEX, (match) => this.valueByPlaceholder.get(match) ?? match);
  }

  rehydrateValue<T>(value: T): T {
    return this.rehydrateUnknown(value, new WeakSet<object>()) as T;
  }

  private rehydrateUnknown(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === "string") return this.rehydrateText(value);
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        return value.map((item) => this.rehydrateUnknown(item, seen));
      }
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        result[this.rehydrateText(key)] = this.rehydrateUnknown(item, seen);
      }
      return result;
    } finally {
      seen.delete(value);
    }
  }
}

// ── Stateless wrappers (one-shot, mapping discarded → effectively destructive) ──
//
// Kept for callers without a request lifecycle. New code that consumes model
// output should hold a PseudonymizationSession and rehydrate.

export function sanitizeTextForLlm(input: string): PiiSanitizationResult<string> {
  return new PseudonymizationSession().sanitizeText(input);
}

export function sanitizeValueForLlm<T>(value: T): PiiSanitizationResult<T> {
  return new PseudonymizationSession().sanitizeValue(value);
}

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

const PLACEHOLDER: Record<PiiRedactionKind, string> = {
  credit_card: "[REDACTED_CREDIT_CARD]",
  email: "[REDACTED_EMAIL]",
  iban: "[REDACTED_IBAN]",
  ip_address: "[REDACTED_IP_ADDRESS]",
  national_id: "[REDACTED_NATIONAL_ID]",
  phone: "[REDACTED_PHONE]",
  secret: "[REDACTED_SECRET]",
};

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

function addCount(redactions: PiiRedactionCounts, kind: PiiRedactionKind, count: number) {
  if (count > 0) redactions[kind] = (redactions[kind] ?? 0) + count;
}

function redactRegex(text: string, kind: PiiRedactionKind, regex: RegExp) {
  let count = 0;
  const value = text.replace(regex, () => {
    count += 1;
    return PLACEHOLDER[kind];
  });
  return { value, count };
}

function redactSecretAssignments(text: string) {
  let count = 0;
  const assigned = text.replace(SECRET_ASSIGNMENT_REGEX, (_match, prefix: string, _secret: string, suffix: string) => {
    count += 1;
    return `${prefix}${PLACEHOLDER.secret}${suffix}`;
  });
  const bearer = assigned.replace(BEARER_TOKEN_REGEX, (_match, prefix: string) => {
    count += 1;
    return `${prefix}${PLACEHOLDER.secret}`;
  });

  return { value: bearer, count };
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

function redactCreditCards(text: string) {
  let count = 0;
  const value = text.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnCheck(digits)) {
      return match;
    }

    count += 1;
    return PLACEHOLDER.credit_card;
  });

  return { value, count };
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

export function sanitizeTextForLlm(input: string): PiiSanitizationResult<string> {
  let value = input;
  const redactions: PiiRedactionCounts = {};

  const secretAssignments = redactSecretAssignments(value);
  value = secretAssignments.value;
  addCount(redactions, "secret", secretAssignments.count);

  for (const [kind, regex] of [
    ["secret", PREFIXED_SECRET_REGEX],
    ["email", EMAIL_REGEX],
    ["iban", IBAN_REGEX],
    ["national_id", NATIONAL_ID_REGEX],
    ["ip_address", IPV4_REGEX],
    ["phone", INTERNATIONAL_PHONE_REGEX],
    ["phone", US_PHONE_REGEX],
  ] as const) {
    const result = redactRegex(value, kind, regex);
    value = result.value;
    addCount(redactions, kind, result.count);
  }

  const creditCards = redactCreditCards(value);
  value = creditCards.value;
  addCount(redactions, "credit_card", creditCards.count);

  return {
    value,
    redactions,
    redacted: hasPiiRedactions(redactions),
  };
}

function sanitizeUnknownForLlm(value: unknown, seen: WeakSet<object>): PiiSanitizationResult<unknown> {
  if (typeof value === "string") return sanitizeTextForLlm(value);
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
      const result = sanitizeUnknownForLlm(item, seen);
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
    const sanitizedKey = sanitizeTextForLlm(key);
    const sanitizedValue = sanitizeUnknownForLlm(item, seen);
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

export function sanitizeValueForLlm<T>(value: T): PiiSanitizationResult<T> {
  const result = sanitizeUnknownForLlm(value, new WeakSet<object>());
  return {
    value: result.value as T,
    redactions: result.redactions,
    redacted: result.redacted,
  };
}

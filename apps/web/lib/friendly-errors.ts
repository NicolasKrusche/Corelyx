const TECHNICAL_PATTERNS = [
  /\b[A-Z0-9_]{8,}\b/,
  /\b\d{3}\b/,
  /\b(uuid|jwt|rls|postgres|supabase|vault|runtime|schema|payload|webhook|rpc)\b/i,
  /expected .* received /i,
  /violates .* constraint/i,
  /duplicate key/i,
  /syntaxerror|typeerror|referenceerror/i,
];

export function friendlyErrorMessage(
  message: string | null | undefined,
  fallback = "Something went wrong. Please try again."
) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return fallback;

  const lower = text.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "The email or password is not correct.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (lower.includes("already registered") || lower.includes("user already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (lower.includes("password should") || lower.includes("password must")) {
    return "Please use a password with at least 8 characters.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many tries. Please wait a moment and try again.";
  }
  if (lower.includes("unauthorized") || lower.includes("authentication required") || lower.includes("not signed in")) {
    return "Please sign in again to continue.";
  }
  if (lower.includes("forbidden") || lower.includes("permission") || lower.includes("viewers cannot")) {
    return "You do not have permission to do that.";
  }
  if (lower.includes("not found")) {
    return "We could not find that item. It may have been moved or deleted.";
  }
  if (lower.includes("no active workspace")) {
    return "Choose or create a workspace first.";
  }
  if (lower.includes("payload too large") || lower.includes("file too large") || lower.includes("image too large")) {
    return "That file is too large. Try a smaller one.";
  }
  if (lower.includes("invalid json") || lower.includes("json could not be parsed") || lower.includes("syntax error")) {
    return "This does not look like valid JSON. Check the formatting and try again.";
  }
  if (lower.includes("genesis") && (lower.includes("invalid") || lower.includes("failed") || lower.includes("could not"))) {
    return "The AI could not generate a valid workflow. Try rephrasing your description and generating again.";
  }
  if (lower.includes("network error") || lower.includes("failed to fetch") || lower.includes("could not reach")) {
    return "We could not connect. Check your internet connection and try again.";
  }
  if (lower.includes("api key")) {
    return "This needs a working API key. Add or update it in API Keys.";
  }
  if (lower.includes("connection expired") || lower.includes("token is expired") || lower.includes("reconnect")) {
    return "This connection needs to be reconnected.";
  }
  if (lower.includes("duplicate") || lower.includes("already exists") || lower.includes("unique")) {
    return "That name is already in use. Try a different one.";
  }
  if (lower.includes("configured") || lower.includes("service_role") || lower.includes("secret")) {
    return "This part of Corelyx is not ready yet. Please contact support if this keeps happening.";
  }

  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return fallback;
  }

  return text;
}

export function friendlyResponseMessage(
  body: { error?: string | null; message?: string | null } | null | undefined,
  fallback?: string
) {
  return friendlyErrorMessage(body?.message ?? body?.error, fallback);
}

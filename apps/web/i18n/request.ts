import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED = new Set([
  "en", "de", "fr", "es", "pt", "it", "nl", "pl",
  "sv", "da", "fi", "cs", "el", "hu", "ro",
  "bg", "sk", "sl", "et", "lt", "lv", "nb",
  "ja", "zh-CN", "ko", "tr", "uk", "ru",
]);

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("corelyx-locale")?.value ?? "en";
  const locale = SUPPORTED.has(raw) ? raw : "en";

  let messages: Record<string, unknown>;
  try {
    messages = ((await import(`../messages/${locale}.json`)) as { default: Record<string, unknown> }).default;
  } catch {
    messages = ((await import("../messages/en.json")) as { default: Record<string, unknown> }).default;
  }

  return { locale, messages };
});

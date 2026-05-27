import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { serverLog } from "@/lib/server-log";

// DeepL is an EU-based (German) translation provider, GDPR-compliant.
// Free tier: api-free.deepl.com (500K chars/month). Paid: api.deepl.com.

const DEEPL_FREE_URL = "https://api-free.deepl.com/v2/translate";
const DEEPL_PAID_URL = "https://api.deepl.com/v2/translate";

const MAX_TEXTS = 50;
const MAX_CHARS_PER_REQUEST = 30_000;
const MAX_CHARS_PER_TEXT = 5_000;

// Map our short language codes to DeepL target codes.
// DeepL docs: https://developers.deepl.com/docs/getting-started/supported-languages
const TARGET_MAP: Record<string, string> = {
  en: "EN-US",
  de: "DE",
  fr: "FR",
  es: "ES",
  it: "IT",
  pt: "PT-PT",
  nl: "NL",
  pl: "PL",
  sv: "SV",
  da: "DA",
  fi: "FI",
  cs: "CS",
  el: "EL",
  hu: "HU",
  ro: "RO",
  bg: "BG",
  sk: "SK",
  sl: "SL",
  et: "ET",
  lt: "LT",
  lv: "LV",
  ja: "JA",
  "zh-CN": "ZH",
  ko: "KO",
  tr: "TR",
  uk: "UK",
  ru: "RU",
  nb: "NB",
};

type RequestBody = {
  texts?: unknown;
  target?: unknown;
  source?: unknown;
};

type DeepLResponse = {
  translations: Array<{ detected_source_language?: string; text: string }>;
};

type DeepLError = {
  message?: string;
};

export async function POST(req: Request) {
  // Translation is available to anonymous visitors so landing / login pages can
  // be translated for international users. Per-request limits below cap abuse.
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return apiError("Translation service is not configured.", 503);
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  if (!body || !Array.isArray(body.texts)) {
    return apiError("Body must include `texts: string[]`.", 400);
  }
  if (typeof body.target !== "string") {
    return apiError("Body must include `target: string`.", 400);
  }

  const targetCode = TARGET_MAP[body.target];
  if (!targetCode) {
    return apiError(`Unsupported target language: ${body.target}`, 400);
  }

  const texts = (body.texts as unknown[]).filter((t): t is string => typeof t === "string");
  if (texts.length === 0) {
    return NextResponse.json({ translations: [] });
  }
  if (texts.length > MAX_TEXTS) {
    return apiError(`Too many texts in one request (max ${MAX_TEXTS}).`, 400);
  }
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  if (totalChars > MAX_CHARS_PER_REQUEST) {
    return apiError(
      `Total characters exceed limit (${totalChars} > ${MAX_CHARS_PER_REQUEST}).`,
      400
    );
  }
  if (texts.some((t) => t.length > MAX_CHARS_PER_TEXT)) {
    return apiError(`A single text exceeds ${MAX_CHARS_PER_TEXT} characters.`, 400);
  }

  const url = process.env.DEEPL_PRO === "true" ? DEEPL_PAID_URL : DEEPL_FREE_URL;
  const sourceCode =
    typeof body.source === "string" && TARGET_MAP[body.source]
      ? TARGET_MAP[body.source].split("-")[0]
      : undefined;

  const payload: Record<string, unknown> = {
    text: texts,
    target_lang: targetCode,
    preserve_formatting: true,
    tag_handling: "html",
  };
  if (sourceCode) payload.source_lang = sourceCode;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    let errMsg = `DeepL request failed (${res.status}).`;
    try {
      const errBody = (await res.json()) as DeepLError;
      if (errBody.message) errMsg = `DeepL: ${errBody.message}`;
    } catch {
      // ignore
    }
    serverLog({ level: "error", event: "translate.deepl_error", message: "DeepL API returned a non-OK response." });
    return apiError(errMsg, 502);
  }

  const data = (await res.json()) as DeepLResponse;
  const translations = data.translations.map((t) => t.text);

  return NextResponse.json({ translations });
}

import { NextResponse } from "next/server";

export const DEFAULT_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

type BoundedTextResult =
  | { ok: true; text: string }
  | { ok: false; response: NextResponse };

type BoundedJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json({ error: "Payload too large" }, { status: 413 });
}

export async function readBoundedTextBody(
  request: Request,
  maxBytes = DEFAULT_WEBHOOK_BODY_LIMIT_BYTES
): Promise<BoundedTextResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return { ok: false, response: payloadTooLargeResponse() };
    }
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: payloadTooLargeResponse() };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(body) };
}

export async function readBoundedJsonBody<T>(
  request: Request,
  maxBytes = DEFAULT_WEBHOOK_BODY_LIMIT_BYTES
): Promise<BoundedJsonResult<T>> {
  const body = await readBoundedTextBody(request, maxBytes);
  if (!body.ok) return body;

  try {
    return { ok: true, value: JSON.parse(body.text) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

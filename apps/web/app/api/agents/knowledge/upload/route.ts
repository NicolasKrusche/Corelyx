import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";
import { checkAgentAccess } from "@/lib/limits";
import { indexKnowledgeDoc } from "@/lib/agents/knowledge-index";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

const KNOWLEDGE_DOC_FIELDS =
  "id, title, content, source_type, source_name, embedding_status, created_at, updated_at";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_CONTENT_CHARS = 100_000; // same cap as pasted knowledge

/** Extensions we can turn into plain text without external services. */
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "html", "htm"]);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractText(file: File): Promise<{ text: string } | { error: string }> {
  const ext = fileExtension(file.name);

  if (ext === "pdf") {
    try {
      const { extractText: extractPdfText } = await import("unpdf");
      const buffer = new Uint8Array(await file.arrayBuffer());
      const { text } = await extractPdfText(buffer, { mergePages: true });
      const merged = (Array.isArray(text) ? text.join("\n\n") : text).trim();
      if (!merged) return { error: "No selectable text found in this PDF (scanned PDFs need OCR)." };
      return { text: merged };
    } catch {
      return { error: "Could not read this PDF. It may be corrupted or password-protected." };
    }
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const raw = (await file.text()).trim();
    if (!raw) return { error: "The file is empty." };
    return { text: ext === "html" || ext === "htm" ? stripHtml(raw) : raw };
  }

  return {
    error: `Unsupported file type ".${ext}". Supported: PDF, Markdown, plain text, CSV, JSON, HTML.`,
  };
}

// POST /api/agents/knowledge/upload — add knowledge from a file.
// multipart/form-data with a "file" field (+ optional "title").
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot add knowledge.", 403);

  const agentAccess = await checkAgentAccess(user.id, ws.workspaceId);
  if (!agentAccess.allowed) {
    return NextResponse.json(
      { error: "AGENTS_REQUIRE_UPGRADE", message: agentAccess.upgradeMessage ?? "Agents require an upgrade." },
      { status: 403 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("Missing file.", 400);
  if (file.size === 0) return apiError("The file is empty.", 400);
  if (file.size > MAX_FILE_BYTES) return apiError("File too large (max 8 MB).", 400);

  const extracted = await extractText(file);
  if ("error" in extracted) return apiError(extracted.error, 400);

  const content = extracted.text.slice(0, MAX_CONTENT_CHARS);
  const titleField = form?.get("title");
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled";
  const title =
    typeof titleField === "string" && titleField.trim()
      ? titleField.trim().slice(0, 200)
      : fallbackTitle;

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      title,
      content,
      source_type: "file",
      source_name: file.name.slice(0, 200),
    } as never)
    .select(KNOWLEDGE_DOC_FIELDS)
    .single();
  if (error) return apiError(error.message, 500);

  const doc = data as { id: string };
  const indexed = await indexKnowledgeDoc(service, {
    id: doc.id,
    workspaceId: ws.workspaceId,
    content,
  });

  return NextResponse.json(
    {
      knowledge: { ...(data as Record<string, unknown>), embedding_status: indexed.status },
      truncated: extracted.text.length > MAX_CONTENT_CHARS,
    },
    { status: 201 }
  );
}

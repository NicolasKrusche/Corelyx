import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getValidOAuthToken } from "@/lib/oauth-token";

// GET /api/connections/:id/resources/:type
// Lists resources available under the authenticated connection so the node
// sidebar can show a dropdown instead of a manual ID input.
//
// Supported types:
//   spreadsheets (sheets) — user's Google Sheets files via Drive API
//
// Returns { resources: [{ id, name }, ...] } on success.

export async function GET(
  _request: Request,
  { params }: { params: { id: string; type: string } }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { data: rowRaw, error: fetchError } = await supabase
    .from("connections")
    .select("provider")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  const row = rowRaw as { provider: string } | null;
  if (fetchError || !row) return apiError("Connection not found", 404);

  const serviceClient = createServiceClient();
  let accessToken: string;
  try {
    accessToken = await getValidOAuthToken(serviceClient, params.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed";
    return apiError(`Connection auth failed: ${message}`, 502);
  }

  try {
    const resources = await listResources(row.provider, params.type, accessToken);
    return NextResponse.json({ resources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list resources";
    return apiError(message, 502);
  }
}

type Resource = { id: string; name: string };

async function listResources(provider: string, type: string, accessToken: string): Promise<Resource[]> {
  if (type === "spreadsheets" && provider === "sheets") {
    return listGoogleSpreadsheets(accessToken);
  }
  throw new Error(`Unsupported resource type "${type}" for provider "${provider}"`);
}

async function listGoogleSpreadsheets(accessToken: string): Promise<Resource[]> {
  // Drive API files.list filtered to spreadsheets. pageSize=100 covers the
  // common case; users with huge drives can paste the ID manually.
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

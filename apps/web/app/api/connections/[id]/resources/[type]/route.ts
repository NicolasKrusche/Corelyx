import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getValidOAuthToken } from "@/lib/oauth-token";

// GET /api/connections/:id/resources/:type
// Lists selectable resources for the authenticated connection so the editor can
// show dropdowns instead of asking users to paste IDs by hand.
export async function GET(
  request: Request,
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
    const url = new URL(request.url);
    const resources = await listResources(row.provider, params.type, accessToken, url.searchParams);
    return NextResponse.json({ resources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list resources";
    return apiError(message, 502);
  }
}

type Resource = { id: string; name: string };

type JsonRecord = Record<string, unknown>;

async function listResources(
  provider: string,
  type: string,
  accessToken: string,
  searchParams: URLSearchParams
): Promise<Resource[]> {
  if (provider === "sheets" && type === "spreadsheets") {
    return listGoogleDriveFiles(accessToken, "application/vnd.google-apps.spreadsheet");
  }
  if (provider === "docs" && type === "documents") {
    return listGoogleDriveFiles(accessToken, "application/vnd.google-apps.document");
  }
  if (provider === "drive" && type === "drive-files") {
    return listGoogleDriveFiles(accessToken);
  }
  if (provider === "drive" && type === "drive-folders") {
    return listGoogleDriveFiles(accessToken, "application/vnd.google-apps.folder");
  }
  if (provider === "calendar" && type === "calendars") {
    return listGoogleCalendars(accessToken);
  }
  if (provider === "slack" && type === "slack-channels") {
    return listSlackChannels(accessToken);
  }
  if (provider === "notion" && type === "notion-databases") {
    return listNotionResources(accessToken, "database");
  }
  if (provider === "notion" && type === "notion-pages") {
    return listNotionResources(accessToken, "page");
  }
  if (provider === "notion" && type === "notion-parents") {
    const [databases, pages] = await Promise.all([
      listNotionResources(accessToken, "database"),
      listNotionResources(accessToken, "page"),
    ]);
    return [...databases, ...pages];
  }
  if (provider === "github" && type === "github-repos") {
    return listGitHubRepos(accessToken);
  }
  if (provider === "airtable" && type === "airtable-bases") {
    return listAirtableBases(accessToken);
  }
  if (provider === "airtable" && type === "airtable-tables") {
    return listAirtableTables(accessToken, searchParams.get("base_id") ?? "");
  }
  if (provider === "typeform" && type === "typeform-forms") {
    return listTypeformForms(accessToken);
  }
  if (provider === "asana" && type === "asana-workspaces") {
    return listAsanaCollection(accessToken, "workspaces");
  }
  if (provider === "asana" && type === "asana-projects") {
    return listAsanaProjects(accessToken, searchParams.get("workspace_id") ?? undefined);
  }
  if (provider === "hubspot" && type === "hubspot-contacts") {
    return listHubSpotObjects(accessToken, "contacts");
  }
  if (provider === "hubspot" && type === "hubspot-deals") {
    return listHubSpotObjects(accessToken, "deals");
  }
  if (provider === "outlook" && type === "outlook-folders") {
    return listOutlookFolders(accessToken);
  }

  throw new Error(`Unsupported resource type "${type}" for provider "${provider}"`);
}

async function getJson<T>(url: string, accessToken: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resource API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

async function postJson<T>(
  url: string,
  accessToken: string,
  body: JsonRecord,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resource API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

async function listGoogleDriveFiles(accessToken: string, mimeType?: string): Promise<Resource[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  const q = [mimeType ? `mimeType='${mimeType}'` : null, "trashed=false"].filter(Boolean).join(" and ");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const data = await getJson<{ files?: Array<{ id: string; name: string }> }>(url.toString(), accessToken);
  return (data.files ?? []).map((file) => ({ id: file.id, name: file.name }));
}

async function listGoogleCalendars(accessToken: string): Promise<Resource[]> {
  const data = await getJson<{ items?: Array<{ id: string; summary?: string; primary?: boolean }> }>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100",
    accessToken
  );
  const calendars = (data.items ?? []).map((calendar) => ({
    id: calendar.id,
    name: `${calendar.summary ?? calendar.id}${calendar.primary ? " (primary)" : ""}`,
  }));

  return [{ id: "primary", name: "Primary calendar" }, ...calendars.filter((calendar) => calendar.id !== "primary")];
}

async function listSlackChannels(accessToken: string): Promise<Resource[]> {
  const url = new URL("https://slack.com/api/conversations.list");
  url.searchParams.set("types", "public_channel,private_channel");
  url.searchParams.set("exclude_archived", "true");
  url.searchParams.set("limit", "200");

  const data = await getJson<{ ok?: boolean; error?: string; channels?: Array<{ id: string; name?: string; is_private?: boolean }> }>(
    url.toString(),
    accessToken
  );
  if (data.ok === false) throw new Error(data.error ?? "Slack returned an error");

  return (data.channels ?? []).map((channel) => ({
    id: channel.id,
    name: `${channel.is_private ? "lock " : "#"}${channel.name ?? channel.id}`,
  }));
}

async function listNotionResources(accessToken: string, objectType: "database" | "page"): Promise<Resource[]> {
  const data = await postJson<{ results?: JsonRecord[] }>(
    "https://api.notion.com/v1/search",
    accessToken,
    {
      page_size: 100,
      filter: { property: "object", value: objectType },
      sort: { direction: "descending", timestamp: "last_edited_time" },
    },
    { "Notion-Version": "2022-06-28" }
  );

  return (data.results ?? []).map((result) => ({
    id: String(result.id ?? ""),
    name: getNotionTitle(result, objectType),
  })).filter((resource) => resource.id);
}

function getNotionTitle(result: JsonRecord, objectType: "database" | "page"): string {
  const title = objectType === "database" ? result.title : findFirstTitleProperty(result.properties);
  if (Array.isArray(title)) {
    const text = title
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const record = entry as JsonRecord;
        if (typeof record.plain_text === "string") return record.plain_text;
        const textObj = record.text;
        if (textObj && typeof textObj === "object" && typeof (textObj as JsonRecord).content === "string") {
          return (textObj as JsonRecord).content;
        }
        return "";
      })
      .join("")
      .trim();
    if (text) return text;
  }
  return objectType === "database" ? "Untitled database" : "Untitled page";
}

function findFirstTitleProperty(properties: unknown): unknown {
  if (!properties || typeof properties !== "object") return null;
  for (const value of Object.values(properties as JsonRecord)) {
    if (value && typeof value === "object" && (value as JsonRecord).type === "title") {
      return (value as JsonRecord).title;
    }
  }
  return null;
}

async function listGitHubRepos(accessToken: string): Promise<Resource[]> {
  const url = new URL("https://api.github.com/user/repos");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");

  const repos = await getJson<Array<{ full_name: string; private?: boolean }>>(url.toString(), accessToken, {
    "X-GitHub-Api-Version": "2022-11-28",
  });

  return repos.map((repo) => ({
    id: repo.full_name,
    name: `${repo.full_name}${repo.private ? " (private)" : ""}`,
  }));
}

async function listAirtableBases(accessToken: string): Promise<Resource[]> {
  const data = await getJson<{ bases?: Array<{ id: string; name: string }> }>(
    "https://api.airtable.com/v0/meta/bases",
    accessToken
  );
  return (data.bases ?? []).map((base) => ({ id: base.id, name: base.name }));
}

async function listAirtableTables(accessToken: string, baseId: string): Promise<Resource[]> {
  if (!baseId) throw new Error("Choose an Airtable base before loading tables");
  const data = await getJson<{ tables?: Array<{ id: string; name: string }> }>(
    `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
    accessToken
  );
  return (data.tables ?? []).map((table) => ({ id: table.name, name: table.name }));
}

async function listTypeformForms(accessToken: string): Promise<Resource[]> {
  const data = await getJson<{ items?: Array<{ id: string; title: string }> }>(
    "https://api.typeform.com/forms?page_size=100",
    accessToken
  );
  return (data.items ?? []).map((form) => ({ id: form.id, name: form.title }));
}

async function listAsanaCollection(accessToken: string, collection: "workspaces"): Promise<Resource[]> {
  const data = await getJson<{ data?: Array<{ gid: string; name: string }> }>(
    `https://app.asana.com/api/1.0/${collection}?limit=100`,
    accessToken
  );
  return (data.data ?? []).map((item) => ({ id: item.gid, name: item.name }));
}

async function listAsanaProjects(accessToken: string, workspaceId?: string): Promise<Resource[]> {
  const url = new URL("https://app.asana.com/api/1.0/projects");
  url.searchParams.set("limit", "100");
  if (workspaceId) url.searchParams.set("workspace", workspaceId);

  const data = await getJson<{ data?: Array<{ gid: string; name: string }> }>(url.toString(), accessToken);
  return (data.data ?? []).map((project) => ({ id: project.gid, name: project.name }));
}

async function listHubSpotObjects(accessToken: string, objectType: "contacts" | "deals"): Promise<Resource[]> {
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${objectType}`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("archived", "false");
  url.searchParams.set("properties", objectType === "contacts" ? "email,firstname,lastname" : "dealname,amount");

  const data = await getJson<{ results?: Array<{ id: string; properties?: JsonRecord }> }>(url.toString(), accessToken);
  return (data.results ?? []).map((item) => {
    const properties = item.properties ?? {};
    const name = objectType === "contacts"
      ? [properties.firstname, properties.lastname].filter(Boolean).join(" ") || String(properties.email ?? item.id)
      : String(properties.dealname ?? item.id);
    return { id: item.id, name };
  });
}

async function listOutlookFolders(accessToken: string): Promise<Resource[]> {
  const data = await getJson<{ value?: Array<{ id: string; displayName: string }> }>(
    "https://graph.microsoft.com/v1.0/me/mailFolders?$top=100",
    accessToken
  );
  return (data.value ?? []).map((folder) => ({ id: folder.id, name: folder.displayName }));
}

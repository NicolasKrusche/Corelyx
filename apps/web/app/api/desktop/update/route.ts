import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GH_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

function json(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * GET /api/desktop/update — Tauri desktop auto-update manifest.
 *
 * The release workflow publishes a signed `latest.json` to the GitHub release;
 * this proxies it so the app's update endpoint stays a stable corelyx.app URL and
 * the repo stays server-config (not baked into the signed app bundle, which would
 * need a re-release to change). Per the Tauri updater contract, 204 = "no update".
 *
 * Set DESKTOP_RELEASES_REPO ("owner/repo"). For a private releases repo, also set
 * GITHUB_RELEASES_TOKEN (fine-grained PAT, Contents:read) so the manifest asset can
 * be pulled with auth; otherwise the public release download URL is used.
 */
export async function GET() {
  const repo = process.env.DESKTOP_RELEASES_REPO;
  if (!repo) return new NextResponse(null, { status: 204 });
  const token = process.env.GITHUB_RELEASES_TOKEN;

  try {
    // Public repo: the manifest is directly downloadable from the release.
    if (!token) {
      const res = await fetch(`https://github.com/${repo}/releases/latest/download/latest.json`, {
        cache: "no-store",
      });
      if (!res.ok) return new NextResponse(null, { status: 204 });
      return json(await res.text());
    }

    // Private repo: find the latest.json asset, then pull it via the authenticated
    // asset API (Accept: octet-stream → bytes; the manifest is tiny so we proxy it).
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    };
    const relRes = await fetch(`${GH_API}/repos/${repo}/releases/latest`, {
      headers: { ...authHeaders, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!relRes.ok) return new NextResponse(null, { status: 204 });
    const release = (await relRes.json()) as { assets?: Array<{ name: string; url: string }> };
    const asset = (release.assets ?? []).find((a) => a.name === "latest.json");
    if (!asset) return new NextResponse(null, { status: 204 });

    const assetRes = await fetch(asset.url, {
      headers: { ...authHeaders, Accept: "application/octet-stream" },
      cache: "no-store",
    });
    if (!assetRes.ok) return new NextResponse(null, { status: 204 });
    return json(await assetRes.text());
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/update — Tauri desktop auto-update manifest.
 *
 * The release workflow publishes a signed `latest.json` to the GitHub release;
 * this proxies it so the app's update endpoint stays a stable corelyx.app URL and
 * the repo stays server-config (not baked into the signed app bundle, which would
 * need a re-release to change). Per the Tauri updater contract, 204 = "no update".
 *
 * Set DESKTOP_RELEASES_REPO ("owner/repo") to enable.
 */
export async function GET() {
  const repo = process.env.DESKTOP_RELEASES_REPO;
  if (!repo) return new NextResponse(null, { status: 204 });

  const manifestUrl = `https://github.com/${repo}/releases/latest/download/latest.json`;
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) return new NextResponse(null, { status: 204 });
    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

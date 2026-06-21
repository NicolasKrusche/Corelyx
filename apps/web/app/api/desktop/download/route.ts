import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Which release asset is the first-time INSTALLER for each OS (not the updater
// artifacts). Windows: MSI or NSIS setup; macOS: DMG; Linux: AppImage.
const INSTALLER_PATTERN: Record<string, RegExp> = {
  windows: /(\.msi|-setup\.exe)$/i,
  macos: /\.dmg$/i,
  linux: /\.AppImage$/i,
};

const GH_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/**
 * GET /api/desktop/download?os=windows|macos|linux — 302 to the latest installer.
 *
 * Resolves the asset from the GitHub "latest" release so the link never hardcodes
 * a version or filename. Set DESKTOP_RELEASES_REPO ("owner/repo") to enable.
 *
 * Private releases repo: set GITHUB_RELEASES_TOKEN (fine-grained PAT, Contents:read)
 * so the asset can be resolved with auth. We then 302 the browser to GitHub's
 * short-lived signed asset URL (which itself needs no auth), so the binary never
 * streams through this server. Public repo: the browser_download_url works directly.
 */
export async function GET(request: Request) {
  const repo = process.env.DESKTOP_RELEASES_REPO;
  const token = process.env.GITHUB_RELEASES_TOKEN;
  const os = new URL(request.url).searchParams.get("os") ?? "";
  const pattern = INSTALLER_PATTERN[os];
  if (!repo || !pattern) {
    return NextResponse.json({ error: "Unsupported OS or downloads not configured yet." }, { status: 404 });
  }

  const authHeaders: Record<string, string> = { "X-GitHub-Api-Version": API_VERSION };
  if (token) authHeaders.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${GH_API}/repos/${repo}/releases/latest`, {
      headers: { ...authHeaders, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "No published release yet." }, { status: 404 });
    const release = (await res.json()) as {
      assets?: Array<{ url: string; name: string; browser_download_url: string }>;
    };
    const asset = (release.assets ?? []).find((a) => pattern.test(a.name));
    if (!asset) return NextResponse.json({ error: "No installer for this OS in the latest release." }, { status: 404 });

    // Public repo (no token): the public download URL is browser-followable.
    if (!token) return NextResponse.redirect(asset.browser_download_url, 302);

    // Private repo: the asset API returns a 302 to a short-lived signed URL.
    const assetRes = await fetch(asset.url, {
      headers: { ...authHeaders, Accept: "application/octet-stream" },
      redirect: "manual",
      cache: "no-store",
    });
    const signed = assetRes.headers.get("location");
    if (!signed) return NextResponse.json({ error: "Could not resolve the download." }, { status: 502 });
    return NextResponse.redirect(signed, 302);
  } catch {
    return NextResponse.json({ error: "Could not resolve the download." }, { status: 502 });
  }
}

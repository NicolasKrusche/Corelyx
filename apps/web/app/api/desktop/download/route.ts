import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Which release asset is the first-time INSTALLER for each OS (not the updater
// artifacts). Windows: MSI or NSIS setup; macOS: DMG; Linux: AppImage.
const INSTALLER_PATTERN: Record<string, RegExp> = {
  windows: /(\.msi|-setup\.exe)$/i,
  macos: /\.dmg$/i,
  linux: /\.AppImage$/i,
};

/**
 * GET /api/desktop/download?os=windows|macos|linux — 302 to the latest installer.
 *
 * Resolves the asset from the GitHub "latest" release so the link never hardcodes
 * a version or filename. Set DESKTOP_RELEASES_REPO ("owner/repo") to enable.
 */
export async function GET(request: Request) {
  const repo = process.env.DESKTOP_RELEASES_REPO;
  const os = new URL(request.url).searchParams.get("os") ?? "";
  const pattern = INSTALLER_PATTERN[os];
  if (!repo || !pattern) {
    return NextResponse.json({ error: "Unsupported OS or downloads not configured yet." }, { status: 404 });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "No published release yet." }, { status: 404 });
    const release = (await res.json()) as {
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const asset = (release.assets ?? []).find((a) => pattern.test(a.name));
    if (!asset) return NextResponse.json({ error: "No installer for this OS in the latest release." }, { status: 404 });
    return NextResponse.redirect(asset.browser_download_url, 302);
  } catch {
    return NextResponse.json({ error: "Could not resolve the download." }, { status: 502 });
  }
}

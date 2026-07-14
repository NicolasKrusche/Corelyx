import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GH_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
// Bounded release-list pagination: 3 × 100 releases is far more history than the
// shared desktop+mobile repo will accumulate between APK releases.
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 3;

/**
 * GET /api/mobile/apk — 302 to the latest Corelyx Mobile Android APK.
 *
 * Interim sideload distribution until the app is on Google Play (the /download
 * page hides this link once the Play listing URL is filled in). Mirrors the
 * desktop installer proxy (/api/desktop/download).
 *
 * Resolution order:
 *   1. MOBILE_APK_URL — direct URL override (e.g. an EAS build artifact or a
 *      public bucket). Simplest hosting; wins when set and absolute.
 *   2. MOBILE_RELEASES_REPO (falls back to DESKTOP_RELEASES_REPO) — scan recent
 *      GitHub releases for the newest one carrying a .apk asset. We scan rather
 *      than trust /releases/latest because the repo is shared with desktop
 *      releases, whose latest release has no APK. Private repo: authenticate
 *      with GITHUB_RELEASES_TOKEN and 302 the browser to GitHub's short-lived
 *      signed asset URL, so the binary never streams through this server and
 *      the token never leaves it.
 *
 * When no APK can be resolved, we 303 back to /download with a reason flag the
 * page renders inline — a raw JSON body would dead-end the phone's browser.
 *
 * Public route by design (like the desktop download): it serves an installer,
 * not user data. Lives under /api/mobile/ so it stays reachable during a
 * maintenance window (same as /api/desktop/).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const backToDownload = (reason: "unavailable" | "error") =>
    NextResponse.redirect(new URL(`/download?apk=${reason}`, origin), 303);

  // Direct override. Validate before redirecting: NextResponse.redirect throws
  // synchronously on a relative/malformed URL, which would 500 every hit if the
  // env var were misconfigured (e.g. "/downloads/corelyx.apk").
  const directUrl = process.env.MOBILE_APK_URL;
  if (directUrl) {
    try {
      return NextResponse.redirect(new URL(directUrl).toString(), 302);
    } catch {
      // Misconfigured override — fall through to the release scan.
    }
  }

  const repo = process.env.MOBILE_RELEASES_REPO || process.env.DESKTOP_RELEASES_REPO;
  const token = process.env.GITHUB_RELEASES_TOKEN;
  if (!repo) return backToDownload("unavailable");

  const authHeaders: Record<string, string> = { "X-GitHub-Api-Version": API_VERSION };
  if (token) authHeaders.Authorization = `Bearer ${token}`;

  try {
    // Newest-first releases; take the first published (non-draft, non-prerelease
    // — same visibility rules as /releases/latest) release asset ending in .apk.
    let asset: { url: string; name: string; browser_download_url: string } | undefined;
    for (let page = 1; page <= MAX_RELEASE_PAGES && !asset; page++) {
      const res = await fetch(
        `${GH_API}/repos/${repo}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`,
        { headers: { ...authHeaders, Accept: "application/vnd.github+json" }, cache: "no-store" }
      );
      if (!res.ok) return backToDownload("unavailable");
      const releases = (await res.json()) as Array<{
        draft?: boolean;
        prerelease?: boolean;
        assets?: Array<{ url: string; name: string; browser_download_url: string }>;
      }>;
      if (releases.length === 0) break; // ran out of releases
      asset = releases
        .filter((r) => !r.draft && !r.prerelease)
        .flatMap((r) => r.assets ?? [])
        .find((a) => /\.apk$/i.test(a.name));
    }
    if (!asset) return backToDownload("unavailable");

    // Public repo (no token): the public download URL is browser-followable.
    if (!token) return NextResponse.redirect(asset.browser_download_url, 302);

    // Private repo: the asset API answers with a 302 to a short-lived signed URL.
    const assetRes = await fetch(asset.url, {
      headers: { ...authHeaders, Accept: "application/octet-stream" },
      redirect: "manual",
      cache: "no-store",
    });
    const signed = assetRes.headers.get("location");
    if (!signed) return backToDownload("error");
    return NextResponse.redirect(signed, 302);
  } catch {
    return backToDownload("error");
  }
}

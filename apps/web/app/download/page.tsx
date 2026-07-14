"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

type OS = "windows" | "macos" | "linux" | "unknown";

const LABEL: Record<OS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unknown: "your computer",
};

const ALL: Exclude<OS, "unknown">[] = ["windows", "macos", "linux"];

// Public store listings. Leave empty until the app is published — the buttons
// then render a "Soon" state instead of linking nowhere. Drop the URLs in here
// (or wire them to env) once the App Store / Play Store listings are live.
const APP_STORE_URL = "";
const PLAY_STORE_URL = "";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  // Phones first: Android UAs contain "linux" and iPhone UAs contain "mac", so
  // without this a phone would be offered a desktop Linux/macOS installer.
  if (ua.includes("android") || ua.includes("iphone") || ua.includes("ipad")) return "unknown";
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("unknown");
  // Set when /api/mobile/apk bounced back because no APK could be resolved
  // (?apk=unavailable|error) — rendered as an inline note instead of the raw
  // JSON dead-end the API would otherwise show on a phone.
  const [apkNotice, setApkNotice] = useState<"unavailable" | "error" | null>(null);
  useEffect(() => {
    setOs(detectOS());
    // window.location instead of useSearchParams: no Suspense boundary needed.
    const flag = new URLSearchParams(window.location.search).get("apk");
    if (flag === "unavailable" || flag === "error") setApkNotice(flag);
  }, []);

  const primary = os === "unknown" ? "windows" : os;
  const others = ALL.filter((o) => o !== primary);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-center text-3xl font-semibold text-gray-900 dark:text-gray-50">Get Corelyx</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-gray-600 dark:text-gray-400">
          Run and manage your workflows and agents — on your machine and in your pocket.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* ── Desktop ─────────────────────────────────────────────────────── */}
          <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-indigo-600 dark:text-indigo-400">
                <rect x="3" y="4" width="18" height="12" rx="1.5" />
                <path d="M2 20h20" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Corelyx Desktop</h2>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Run your workflows and agents on local files — securely, on your machine.
              Sign in once and it pairs automatically; it auto-updates from here on.
            </p>

            <div className="mt-auto pt-8">
              <a
                href={`/api/desktop/download?os=${primary}`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Download for {LABEL[primary]}
              </a>
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {others.map((o) => (
                  <a key={o} href={`/api/desktop/download?os=${o}`} className="underline-offset-4 hover:text-gray-700 hover:underline dark:hover:text-gray-200">
                    {LABEL[o]}
                  </a>
                ))}
              </div>
              <p className="mt-6 text-[11px] text-gray-400">
                Requires a Solo plan or higher. After installing, open it and sign in with your Corelyx account.
              </p>
            </div>
          </section>

          {/* ── Mobile ──────────────────────────────────────────────────────── */}
          <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <Image
              src="/pictures/logo-no-bg.png"
              alt="Corelyx Mobile"
              width={64}
              height={64}
              className="mx-auto mb-5 h-16 w-16 rounded-2xl"
            />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Corelyx Mobile</h2>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Approve sign-ins in one tap, stay on top of your agents, and manage your account from anywhere.
            </p>

            <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-xs text-gray-600 dark:text-gray-400">
              {[
                "Corelyx Guard — approve two-factor sign-ins in one tap",
                "Review and approve agent runs on the go",
                "Your agent inbox and chat",
                "Account, usage, and billing",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                <StoreButton href={APP_STORE_URL} top="Download on the" bottom="App Store" icon={<AppleIcon />} />
                <StoreButton href={PLAY_STORE_URL} top="Get it on" bottom="Google Play" icon={<PlayIcon />} />
              </div>
              {/* Interim sideload path — disappears once the Play listing is live. */}
              {!PLAY_STORE_URL && (
                <>
                  {/* Plain <a>: this is a binary download from an API route, not a page
                      navigation — <Link> prefetch would fire spurious download requests. */}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a
                    href="/api/mobile/apk"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
                  >
                    <AndroidIcon />
                    Download the Android app (.apk)
                  </a>
                  {apkNotice ? (
                    <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      {apkNotice === "unavailable"
                        ? "The Android app isn't published yet — check back soon."
                        : "We couldn't fetch the APK right now. Please try again in a few minutes."}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-400">
                      Direct install while we&apos;re not on Google Play yet — your phone will ask you to
                      allow installs from your browser.
                    </p>
                  )}
                </>
              )}
              <p className="mt-6 text-[11px] text-gray-400">
                {APP_STORE_URL || PLAY_STORE_URL
                  ? "Sign in with your Corelyx account, then approve sign-ins from your phone."
                  : "App Store and Google Play listings are coming soon. The mobile companion is free on every plan."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function StoreButton({
  href,
  top,
  bottom,
  icon,
}: {
  href: string;
  top: string;
  bottom: string;
  icon: ReactNode;
}) {
  const inner = (
    <>
      <span className="text-current">{icon}</span>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide opacity-70">{top}</span>
        <span className="block text-sm font-semibold">{bottom}</span>
      </span>
    </>
  );

  if (!href) {
    return (
      <div
        aria-disabled
        title="Coming soon"
        className="inline-flex cursor-default items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400"
      >
        {inner}
        <span className="ml-1 rounded bg-gray-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          Soon
        </span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-3 rounded-lg bg-gray-900 px-4 py-2.5 text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
    >
      {inner}
    </a>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3-.76.86-2 1.52-3.02 1.44-.13-1.1.42-2.28 1.08-3.02.74-.84 2.06-1.48 3.06-1.5.02.03.02.05 0 .08zM20.9 17.1c-.5 1.15-.74 1.66-1.38 2.68-.9 1.42-2.17 3.2-3.74 3.2-1.4.02-1.76-.9-3.66-.9-1.9 0-2.3.9-3.68.92-1.57.03-2.76-1.55-3.66-2.98-2.5-3.98-2.77-8.65-1.22-11.13 1.1-1.76 2.84-2.79 4.47-2.79 1.66 0 2.7.92 4.07.92 1.33 0 2.14-.92 4.06-.92 1.45 0 2.98.79 4.07 2.15-3.58 1.96-3 7.07.35 8.85z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 00-.14-.52.38.38 0 00-.52.14l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 00-.52-.14.38.38 0 00-.14.52L6.4 9.48A10.86 10.86 0 001 18.5h22a10.86 10.86 0 00-5.4-9.02zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <path d="M3.6 2.2c-.2.2-.3.5-.3.9v17.8c0 .4.1.7.3.9l.1.1L13.5 12 3.7 2.1l-.1.1z" fill="#00d3ff" />
      <path d="M17.2 15.7L13.5 12l3.7-3.7 4.4 2.5c1.2.7 1.2 1.8 0 2.5l-4.4 2.4z" fill="#ffc107" />
      <path d="M3.6 2.2L13.5 12l3.7-3.7L5.5 1.4c-.7-.4-1.4-.4-1.9.8z" fill="#00e676" />
      <path d="M3.6 21.8l9.9-9.8 3.7 3.7L5.5 22.6c-.7.4-1.4.4-1.9-.8z" fill="#ff3d47" />
    </svg>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { CookieNotice } from "@/components/consent-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageBootstrap, LanguagePrompt } from "@/components/language-switcher";
import { GenesisJobProvider } from "@/components/genesis/genesis-job-provider";
import { PersistentAiDisclosure } from "@/components/ai-transparency";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Hardcode the canonical domain — never rely solely on env var for metadataBase
// because it may not be set at build time, breaking absolute OG image URLs.
const SITE_URL = "https://www.corelyx.app";

const OG_DESCRIPTION =
  "Corelyx is the AI automation platform that automatically inventories, classifies, documents, audits, reviews, and governs every AI workflow for GDPR and EU AI Act readiness.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Corelyx - EU-Native Compliance-First AI Workflow Automation",
    template: "%s | Corelyx",
  },
  description: OG_DESCRIPTION,
  // Explicit robots for the root — individual private routes override with noindex
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    siteName: "Corelyx",
    title: "Corelyx - EU-Native Compliance-First AI Workflow Automation",
    description: OG_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/pictures/og-image.png",
        width: 1200,
        height: 630,
        alt: "Corelyx - EU-native compliance-first AI workflow automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@corelyx",
    title: "Corelyx - EU-Native Compliance-First AI Workflow Automation",
    description: OG_DESCRIPTION,
    images: ["/pictures/og-image.png"],
  },
  icons: {
    icon: "/pictures/logo-no-bg.png",
    apple: "/pictures/logo-no-bg.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getLocale();
  const messages = await getMessages();
  const aiDisclosure = await getTranslations("aiDisclosure");
  return (
    <html lang={locale} className={`${inter.variable} light accent-blue`} suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply landing override or persisted base + accent before first paint */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var el=document.documentElement;var bases=['dark','light'];var accents=['orange','blue','indigo','green','pink','cyan'];var bgs=['default','noir','liquid','obsidian'];var p=location.pathname.replace(/\\/$/,'')||'/';var forceOrange=['/','/login','/signup','/forgot-password','/update-password'].includes(p);el.classList.remove('dark','light','accent-orange','accent-blue','accent-indigo','accent-green','accent-pink','accent-cyan','bg-default','bg-noir','bg-liquid','bg-obsidian');if(forceOrange){el.setAttribute('data-corelyx-forced-orange-theme','true');el.classList.add('light','accent-orange','bg-default');return;}el.removeAttribute('data-corelyx-forced-orange-theme');var b=localStorage.getItem('corelyx-base');var a=localStorage.getItem('corelyx-accent');var bg=localStorage.getItem('corelyx-bg');var base=b&&bases.includes(b)?b:'light';var acc=a&&accents.includes(a)?a:'blue';var bgStyle=bg&&bgs.includes(bg)?bg:'default';el.classList.add(base,'accent-'+acc,'bg-'+bgStyle);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <LanguageBootstrap />
            <GenesisJobProvider>
              {children}
            </GenesisJobProvider>
            <LanguagePrompt />
            <CookieNotice
              aiDisclosureTitle={aiDisclosure("title")}
              aiDisclosureMessage={aiDisclosure("message")}
            />
            <PersistentAiDisclosure
              title={aiDisclosure("title")}
              message={aiDisclosure("message")}
            />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

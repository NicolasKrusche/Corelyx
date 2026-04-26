import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/consent-banner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://corelyx.app";

export const metadata: Metadata = {
  title: {
    default: "Corelyx — Visual AI Automation",
    template: "%s — Corelyx",
  },
  description:
    "Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: "Corelyx",
    title: "Corelyx — Visual AI Automation",
    description:
      "Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself.",
    url: APP_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Corelyx — Visual AI Automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Corelyx — Visual AI Automation",
    description:
      "Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/pictures/logo-no-bg.png",
    apple: "/pictures/logo-no-bg.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} light accent-blue`} suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply landing override or persisted base + accent before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var el=document.documentElement;var bases=['dark','light'];var accents=['orange','blue','indigo','green','pink','cyan'];var p=location.pathname.replace(/\\/$/,'')||'/';var forceOrange=['/','/login','/signup','/forgot-password','/update-password'].includes(p);el.classList.remove('dark','light','accent-orange','accent-blue','accent-indigo','accent-green','accent-pink','accent-cyan');if(forceOrange){el.setAttribute('data-corelyx-forced-orange-theme','true');el.classList.add('light','accent-orange');return;}el.removeAttribute('data-corelyx-forced-orange-theme');var b=localStorage.getItem('corelyx-base');var a=localStorage.getItem('corelyx-accent');var base=b&&bases.includes(b)?b:'light';var acc=a&&accents.includes(a)?a:'blue';el.classList.add(base,'accent-'+acc);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          {children}
          <CookieNotice />
        </ThemeProvider>
      </body>
    </html>
  );
}

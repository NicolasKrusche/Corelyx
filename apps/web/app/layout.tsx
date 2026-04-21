import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexflow.app";

export const metadata: Metadata = {
  title: {
    default: "Nexflow — Visual AI Automation",
    template: "%s — Nexflow",
  },
  description:
    "Describe what you want to automate. Nexflow designs the agent graph, you tune it visually — then it runs itself.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: "Nexflow",
    title: "Nexflow — Visual AI Automation",
    description:
      "Describe what you want to automate. Nexflow designs the agent graph, you tune it visually — then it runs itself.",
    url: APP_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nexflow — Visual AI Automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexflow — Visual AI Automation",
    description:
      "Describe what you want to automate. Nexflow designs the agent graph, you tune it visually — then it runs itself.",
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
    <html lang="en" className={`${inter.variable} dark accent-orange`}>
      <head>
        {/* Anti-flash: apply persisted base + accent before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=localStorage.getItem('nexflow-base');var a=localStorage.getItem('nexflow-accent');var bases=['dark','light'];var accents=['orange','blue','indigo','green','pink','cyan'];var el=document.documentElement;var base=b&&bases.includes(b)?b:'dark';var acc=a&&accents.includes(a)?a:'orange';el.classList.remove('dark','light','accent-orange','accent-blue','accent-indigo','accent-green','accent-pink','accent-cyan');el.classList.add(base,'accent-'+acc);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Nexflow",
  description: "How Nexflow collects, uses, and protects your data.",
};

const LAST_UPDATED = "April 19, 2026";

const sections = [
  {
    id: "overview",
    title: "1. Overview",
    content: `Nexflow ("we", "us", or "our") is a visual AI automation platform. This Privacy Policy explains what information we collect when you use Nexflow, how we use it, and your rights regarding that information.

By creating an account or using our services, you agree to the practices described in this policy. If you do not agree, please do not use Nexflow.`,
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    subsections: [
      {
        title: "Account Information",
        content: `When you sign up, we collect your email address and, if you use Google Sign-In, your name and profile picture as provided by Google. We store a hashed password if you register with email and password directly.`,
      },
      {
        title: "Automation Programs",
        content: `We store the programs (agent graphs) you create, including their node configurations, edge connections, and execution settings. This data is necessary to run your automations.`,
      },
      {
        title: "Run Logs and Telemetry",
        content: `When a program executes, we record run status, node execution states, timing information, token usage, and cost estimates. We store input/output data passed between nodes only for the duration needed to display run logs. We do not use this data for model training.`,
      },
      {
        title: "Third-Party Connection Credentials",
        content: `When you connect a third-party service (Gmail, Slack, Notion, GitHub, etc.), we store the OAuth access token and refresh token in Supabase Vault — an encrypted secret storage system. These tokens are never returned to your browser and are only accessed server-side at execution time. API keys you add are likewise encrypted at rest in Vault and never exposed in API responses.`,
      },
      {
        title: "Usage Data",
        content: `We collect standard server logs including IP addresses, browser user-agent strings, pages visited, and feature usage. This helps us diagnose issues and improve the product.`,
      },
    ],
  },
  {
    id: "how-we-use",
    title: "3. How We Use Your Information",
    content: `We use the information we collect to:

• Provide, operate, and maintain the Nexflow platform
• Execute your automation programs on your behalf using the credentials you have granted
• Send transactional emails (run failure alerts, human-approval notifications, password resets)
• Diagnose bugs and improve platform reliability
• Enforce our Terms of Service and usage limits
• Comply with legal obligations

We do not sell your personal information to third parties. We do not use your automation data or third-party credentials for any purpose other than executing the automations you configure.`,
  },
  {
    id: "google-api",
    title: "4. Google API Services",
    content: `Nexflow's use of information received from Google APIs (Gmail, Google Sheets, Google Docs, Google Drive, Google Calendar) complies with the Google API Services User Data Policy, including the Limited Use requirements.

Specifically:

• We only request the OAuth scopes necessary for the operations you configure in your programs (e.g. reading emails, writing to a spreadsheet).
• We use Google user data solely to perform the actions you have explicitly configured in your automation programs.
• We do not transfer Google user data to third parties except as necessary to run your automations (e.g. passing an email body to an AI model you have configured).
• We do not use Google user data for advertising or to train AI/ML models.
• We do not allow humans to read your Google user data unless you explicitly request support and consent to access for debugging purposes.

You can revoke Nexflow's access to your Google account at any time by visiting your Google Account permissions page (myaccount.google.com/permissions) or by disconnecting the connection from within Nexflow.`,
  },
  {
    id: "third-party-services",
    title: "5. Third-Party Services",
    content: `Nexflow uses the following sub-processors to deliver the service:

• Supabase — database, authentication, and secret storage (EU/US data centers)
• Railway — Python runtime execution environment
• Vercel — Next.js web application hosting
• Anthropic / OpenAI / OpenRouter — AI model providers (data sent only when you configure an agent node that uses these providers; governed by their respective privacy policies)
• Inngest — trigger and workflow orchestration

Each sub-processor is contractually bound to use your data only to provide the services we have engaged them for.`,
  },
  {
    id: "data-retention",
    title: "6. Data Retention",
    content: `• Account data is retained as long as your account is active.
• Run logs are retained for 90 days by default.
• OAuth tokens are deleted immediately when you disconnect a connection from Nexflow.
• When you delete your account, all your programs, run logs, and credentials are permanently deleted within 30 days.

You may request earlier deletion by contacting us (see Section 9).`,
  },
  {
    id: "security",
    title: "7. Security",
    content: `We take reasonable technical and organizational measures to protect your data:

• All data in transit is encrypted using TLS 1.2 or higher.
• OAuth tokens and API keys are stored in Supabase Vault with encryption at rest.
• Credentials are never returned to your browser — they are fetched server-side only at execution time and discarded immediately after each node runs.
• Row-Level Security (RLS) policies in our database ensure you can only access your own data.
• Our internal APIs require authentication and validate ownership before returning any resource.

No system is perfectly secure. If you discover a security vulnerability, please contact us at the address below rather than disclosing it publicly.`,
  },
  {
    id: "your-rights",
    title: "8. Your Rights",
    content: `Depending on your jurisdiction, you may have the following rights:

• Access — request a copy of the personal data we hold about you
• Correction — ask us to correct inaccurate data
• Deletion — ask us to delete your account and all associated data
• Portability — request an export of your programs in JSON format
• Objection — object to certain processing activities

To exercise any of these rights, contact us at the address in Section 9. We will respond within 30 days.`,
  },
  {
    id: "cookies",
    title: "9. Cookies",
    content: `Nexflow uses cookies and localStorage strictly for:

• Maintaining your authenticated session (via Supabase Auth)
• Remembering your UI preferences (theme selection)

We do not use cookies for advertising, cross-site tracking, or analytics beyond basic server logs.`,
  },
  {
    id: "children",
    title: "10. Children's Privacy",
    content: `Nexflow is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us and we will delete it.`,
  },
  {
    id: "changes",
    title: "11. Changes to This Policy",
    content: `We may update this policy from time to time. We will notify you of material changes by posting a notice in the Nexflow dashboard or by email. Continued use of the service after changes take effect constitutes acceptance of the updated policy.`,
  },
  {
    id: "contact",
    title: "12. Contact",
    content: `For privacy questions, data deletion requests, or to report a security issue, contact us at:

privacy@nexflow.app

We aim to respond to all privacy inquiries within 5 business days.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots opacity-15" />
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.07) 0%, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-6 w-6 object-contain" />
            <span className="font-bold text-sm tracking-tight">Nexflow</span>
          </Link>
          <Link href="/" className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
            ← Back to homepage
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="flex gap-12">
          {/* Table of contents — sticky sidebar on large screens */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-3 px-3">Contents</p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-all duration-150 leading-snug"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-10">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-lg font-bold mb-4 text-foreground">{section.title}</h2>

                {"subsections" in section && section.subsections ? (
                  <div className="space-y-5">
                    {section.subsections.map((sub) => (
                      <div key={sub.title}>
                        <h3 className="text-sm font-semibold text-foreground/80 mb-2">{sub.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{sub.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {"content" in section ? section.content : ""}
                  </p>
                )}

                <div className="mt-8 border-t border-border/30" />
              </section>
            ))}

            {/* Footer note */}
            <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-2">Questions about this policy?</p>
              <p>
                Email us at{" "}
                <a href="mailto:privacy@nexflow.app" className="text-primary hover:underline">
                  privacy@nexflow.app
                </a>
                . For your account and program data, visit your{" "}
                <Link href="/dashboard" className="text-primary hover:underline">
                  dashboard
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 px-6 py-6 mt-16">
        <div className="mx-auto max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/50">
          <span>© {new Date().getFullYear()} Nexflow. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-foreground transition-colors font-medium text-muted-foreground/70">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

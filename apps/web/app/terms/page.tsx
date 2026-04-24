import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "Terms of Service - Nexflow",
  description: "The terms that govern your use of the Nexflow platform.",
};

const LAST_UPDATED = "April 24, 2026";

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    content: `By creating a Nexflow account or using any part of the Nexflow platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not access or use the Service.

If you are using the Service on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these Terms.

These Terms distinguish between consumers and business customers where required by mandatory law. A "consumer" means a natural person acting for purposes outside their trade, business, or profession within the meaning of the Austrian Konsumentenschutzgesetz (KSchG) and applicable EU consumer law.`,
  },
  {
    id: "description",
    title: "2. Description of Service",
    content: `Nexflow is a visual AI automation platform that allows users to design, configure, and run agent-based automation programs ("Programs") that connect to third-party services. The Service includes the web application, the program execution runtime, and any APIs we make available.

The Service may change over time. We reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice where practical, subject to the notice requirements in Section 12.`,
  },
  {
    id: "accounts",
    title: "3. Account Registration",
    content: `You must provide accurate and complete information when creating your account. You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account.

You must notify us immediately at legal@nexflow.app if you suspect unauthorized access to your account. We are not liable for any loss or damage arising from your failure to protect your account.

You may not share your account, create multiple accounts to circumvent usage limits, or register on behalf of someone else without their consent.`,
  },
  {
    id: "acceptable-use",
    title: "4. Acceptable Use",
    content: `You agree not to use the Service to:

- Violate any applicable law or regulation
- Infringe the intellectual property rights of any third party
- Transmit malware, viruses, or any other malicious code
- Attempt to gain unauthorized access to any system, network, or account
- Scrape, crawl, or harvest data from third-party services in violation of their terms
- Send unsolicited bulk communications (spam)
- Impersonate any person or entity
- Engage in any activity that places unreasonable load on our infrastructure
- Circumvent or attempt to circumvent any usage limits, rate limits, or access controls
- Resell or sublicense access to the Service without our written permission

We reserve the right to suspend or terminate accounts that violate these rules, with or without prior notice depending on the severity of the violation.`,
  },
  {
    id: "free-tier",
    title: "5. Free Tier and Usage Limits",
    content: `Nexflow offers a free tier that allows you to create and run a limited number of Programs. The specific limits of the free tier are displayed in your account dashboard and may change over time with reasonable notice.

Paid plans with higher limits are available. Pricing and plan details are described on our pricing page or within the dashboard.

We reserve the right to throttle or suspend execution of Programs that consume excessive resources, regardless of plan, to ensure fair access for all users.`,
  },
  {
    id: "third-party",
    title: "6. Third-Party Services and Credentials",
    content: `The Service allows you to connect third-party accounts (such as Gmail, Slack, GitHub, Notion, and others) and to provide API keys for AI model providers. By doing so:

- You confirm you have the right to grant Nexflow the access you are configuring
- You are solely responsible for ensuring your use of third-party services through Nexflow complies with those services' terms and policies
- You acknowledge that Nexflow acts as your agent when accessing third-party services on your behalf; any actions taken by your Programs are your responsibility
- You are responsible for any costs incurred with third-party providers (including AI model API usage fees) as a result of your Programs running

Nexflow stores your credentials encrypted in Supabase Vault and accesses them only to execute your Programs. See our Privacy Policy for more detail.`,
  },
  {
    id: "content",
    title: "7. Your Content",
    content: `You retain ownership of the Programs, prompts, and configurations you create in Nexflow ("Your Content"). By using the Service, you grant Nexflow a limited, non-exclusive license to store and execute Your Content solely for the purpose of providing the Service to you.

You are solely responsible for ensuring Your Content and the automations you build do not violate any law, third-party rights, or these Terms.

We do not claim any ownership over data that flows through your Programs from third-party services.`,
  },
  {
    id: "ip",
    title: "8. Intellectual Property",
    content: `The Nexflow platform, including its software, design, trademarks, and documentation, is owned by Nexflow and protected by applicable intellectual property laws. These Terms do not grant you any rights in our intellectual property beyond the limited right to use the Service as described herein.

You may not copy, modify, reverse engineer, or create derivative works of any part of the Service.`,
  },
  {
    id: "disclaimers",
    title: "9. Disclaimers",
    content: `The Service is provided "as is" and "as available". To the extent permitted by applicable law, we make no warranties, express or implied, regarding merchantability, fitness for a particular purpose, or non-infringement.

In particular, we do not warrant that:
- The Service will be uninterrupted, error-free, or fully secure at all times
- AI-generated outputs from your Programs will be accurate or suitable for any particular purpose
- Third-party services connected through Nexflow will remain available or function as expected

You are responsible for verifying the outputs of any automated Program before acting on them.

If you are a consumer, nothing in this section affects your statutory rights under Austrian or applicable EU law, including rights to a conforming digital service under the EU Digital Content Directive (Directive 2019/770 as implemented in Austria).`,
  },
  {
    id: "liability",
    title: "10. Limitation of Liability",
    content: `To the extent permitted by applicable law, our total liability to you for all claims arising from or related to the Service shall not exceed the greater of (a) the amount you paid to Nexflow in the twelve months preceding the claim, or (b) EUR 100.

We are not liable for indirect, incidental, or consequential damages — including loss of data, loss of profits, or business interruption — arising from your use of or inability to use the Service, unless caused by our gross negligence or wilful misconduct.

Mandatory limits under Austrian and EU law that cannot be excluded by agreement always apply. In particular:
- Liability for damages caused intentionally or by gross negligence cannot be limited or excluded under Austrian law (§ 6 KSchG for consumers; § 879 ABGB generally).
- Liability for personal injury or death caused by our fault cannot be limited.
- Statutory consumer rights under applicable EU directives are not affected.

For business customers (non-consumers), liability for slight negligence is excluded to the fullest extent permitted by Austrian commercial law.`,
  },
  {
    id: "termination",
    title: "11. Termination",
    content: `You may close your account at any time by visiting your account settings. Upon termination, your Programs and credentials will be deleted in accordance with our Privacy Policy.

We may suspend or terminate your access to the Service at any time if you breach these Terms, engage in fraudulent or abusive activity, or if we are required to do so by law. In non-urgent cases, we will attempt to provide reasonable notice.

Sections 7, 9, 10, and 12 of these Terms survive termination.`,
  },
  {
    id: "changes",
    title: "12. Changes to These Terms",
    content: `We may update these Terms from time to time. For material changes, we will provide at least 30 days' notice by email or by displaying a prominent notice in the dashboard before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.

If you disagree with a material change, you may close your account before the effective date without penalty.

For business customers, a notice period of at least 14 days applies for material changes. Non-material clarifications or corrections may take effect immediately.`,
  },
  {
    id: "consumer-rights",
    title: "13. Consumer Rights and Dispute Resolution",
    content: `If you are a consumer within the meaning of Austrian or EU consumer law, the following additional provisions apply.

Right of withdrawal: You have a 14-day right of withdrawal from a new paid subscription, starting from the date of purchase, without giving reasons. To exercise this right, contact us at legal@nexflow.app before the period expires. If you have already actively used the paid features of the Service and expressly consented to the Service commencing before the withdrawal period ended, your right of withdrawal may be lost as permitted by § 18 FAGG (Fern- und Auswärtsgeschäfte-Gesetz) and Article 16(m) of Directive 2011/83/EU.

Statutory conformity rights: You are entitled to a digital service that conforms to what was agreed and is free from defects. If the Service is non-conforming, you may request remedy, a price reduction, or — where remedy is impossible or refused — termination of the contract, in accordance with the Austrian UGB and the EU Digital Content Directive (2019/770).

Mandatory consumer protections: Regardless of the governing law clause in Section 14, mandatory consumer protection rules of your country of residence within the EU or EEA apply where they afford greater protection.

Online Dispute Resolution: The European Commission provides an Online Dispute Resolution platform at https://ec.europa.eu/consumers/odr for resolving disputes relating to online purchases. Our contact address for ODR purposes is legal@nexflow.app. We are not obliged to participate in an alternative dispute resolution procedure, but we are willing to seek an amicable solution in the first instance.

Austrian consumer arbitration: Consumers may also contact the Austrian Internet Ombudsman (www.ombudsmann.at) or the Alternative Dispute Resolution body (AStG) relevant to their situation.`,
  },
  {
    id: "governing-law",
    title: "14. Governing Law and Jurisdiction",
    content: `These Terms are governed by the laws of the Republic of Austria, excluding its conflict-of-law rules. The UN Convention on Contracts for the International Sale of Goods (CISG) does not apply.

For disputes arising from these Terms or your use of the Service, the competent courts of Vienna, Austria have jurisdiction.

If you are a consumer resident in the European Union or the European Economic Area, you may also bring proceedings before the courts of your country of habitual residence. The mandatory consumer protection laws of your country of residence apply to the extent they afford greater protection than Austrian law and cannot be derogated from by agreement.`,
  },
  {
    id: "contact",
    title: "15. Contact",
    content: `For questions about these Terms, contact us at:

legal@nexflow.app

For privacy-related matters, see our Privacy Policy or email privacy@nexflow.app.`,
  },
];

export default async function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots opacity-15" />
        <div
          className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, rgba(168,85,247,0.06) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      <LegalPageHeader maxWidthClass="max-w-4xl" />

      <main className="relative mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="flex gap-12">
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                Contents
              </p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-3 py-1.5 text-xs leading-snug text-muted-foreground/60 transition-all duration-150 hover:bg-accent hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-10">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24"
              >
                <h2 className="mb-4 text-lg font-bold text-foreground">
                  {section.title}
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {section.content}
                </p>
                <div className="mt-8 border-t border-border/30" />
              </section>
            ))}

            <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
              <p className="mb-2 font-semibold text-foreground">
                Related policies
              </p>
              <p>
                These Terms should be read alongside our{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                , which explains how we collect and handle your data. Questions?
                Email{" "}
                <a
                  href="mailto:legal@nexflow.app"
                  className="text-primary hover:underline"
                >
                  legal@nexflow.app
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground/50 sm:flex-row">
          <span>(c) {new Date().getFullYear()} Nexflow. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/impressum"
              className="transition-colors hover:text-foreground"
            >
              Impressum
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

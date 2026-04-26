import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "Terms of Service - Corelyx",
  description: "The terms that govern your use of the Corelyx platform.",
};

const LAST_UPDATED = "April 24, 2026";

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    content: `By creating a Corelyx account or using any part of the Corelyx platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not access or use the Service.

If you are using the Service on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these Terms.

These Terms distinguish between consumers and business customers where required by mandatory law. A "consumer" means a natural person acting for purposes outside their trade, business, or profession within the meaning of the Austrian Konsumentenschutzgesetz (KSchG) and applicable EU consumer law.`,
  },
  {
    id: "description",
    title: "2. Description of Service",
    content: `Corelyx is a visual AI automation platform that allows users to design, configure, and run agent-based automation programs ("Programs") that connect to third-party services. The platform enables, among other things:

- Automated processing, categorisation, and sorting of emails
- Transfer of structured data to external services (e.g. Google Sheets, Notion)
- Execution of custom AI workflows
- Purchase and use of API Credits for AI requests

The Service includes the web application, the program execution runtime, and any APIs we make available. The scope of features depends on your subscription plan (Free, Pro, Max).

The AI features are powered by models and APIs from third-party providers, in particular Anthropic Inc. (USA) and Google LLC (USA). Corelyx acts as a reseller of these capacities — we are not the manufacturer of the underlying AI models.

The Service may change over time. We reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice where practical, subject to the notice requirements in Section 12.`,
  },
  {
    id: "accounts",
    title: "3. Account Registration",
    content: `You must provide accurate and complete information when creating your account. You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account.

Registration is permitted only for natural persons who have reached the age of 18, or for legally capable companies. By registering, you confirm you meet this requirement.

One account per person or company is permitted. Multiple accounts require our prior written consent.

You must notify us immediately at legal@corelyx.app if you suspect unauthorized access to your account. We are not liable for any loss or damage arising from your failure to protect your account.`,
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
- Send unsolicited bulk communications (spam) via the automation features
- Process personal data of third parties without their consent or a lawful basis
- Impersonate any person or entity
- Engage in any activity that places unreasonable load on our infrastructure
- Circumvent or attempt to circumvent any usage limits, rate limits, or access controls
- Reverse-engineer, decompile, or extract API credentials or AI model weights
- Resell or transfer API Credits or account credentials to third parties
- Resell or sublicense access to the Service without our written permission

We reserve the right to suspend or terminate accounts that violate these rules, with or without prior notice depending on the severity of the violation.

Because the Service uses the Anthropic API, you are also required to comply with Anthropic's Usage Policy (https://www.anthropic.com/legal/usage-policy).`,
  },
  {
    id: "plans-and-credits",
    title: "5. Plans, API Credits, and Payment",
    content: `Subscription plans: Corelyx offers Free, Pro, and Max plans. The Free plan is provided at no cost with limited features and no SLA guarantee. Pro and Max are monthly subscriptions with extended features and priority processing. Current pricing and plan details are published on our pricing page.

API Credits: You may purchase additional API Credits to perform AI requests beyond the quota included in your plan.
- Credits are charged on consumption and are non-refundable once used.
- Unused credits expire 12 months after purchase, unless your subscription is cancelled before then.
- If you cancel your subscription, remaining credits may be used for 30 days after the cancellation takes effect.

Payment and invoicing: Subscription fees are charged monthly in advance via Stripe, our payment service provider. Invoices are provided electronically. If payment is overdue, we may suspend access to the Service until the outstanding balance is settled.

Price changes: We may adjust prices with at least 30 days' notice by email. If you do not object within 14 days of receiving notice, the new price is deemed accepted. If you object to a price increase, you may cancel your subscription at the end of the current billing period without penalty.`,
  },
  {
    id: "duration-termination",
    title: "6. Duration and Termination",
    content: `Subscriptions run on a monthly basis and renew automatically unless cancelled.

You may cancel at any time with effect from the end of the current billing month, via your account settings or by email to legal@corelyx.app.

We may terminate your access immediately for material breach of these Terms, including violations of the acceptable use rules in Section 4, overdue payment beyond 14 days, or abusive use of API Credits. In less urgent cases, we will provide reasonable notice.

Following termination, all your data will be permanently deleted within 60 days. Recovery is not possible after this period.

Consumer right of withdrawal: If you are a consumer, you have a 14-day right of withdrawal from a new paid subscription starting from the date of purchase. To exercise this right, contact us at legal@corelyx.app before the period expires. If you have already actively used the paid features and expressly consented to the Service commencing before the withdrawal period ended, your right of withdrawal may be lost as permitted by § 18 FAGG and Article 16(m) of Directive 2011/83/EU.`,
  },
  {
    id: "liability",
    title: "7. Liability and Disclaimers",
    content: `AI-generated outputs: The platform produces results using AI models (machine learning). These results — including categorisations, summaries, data transfers, and automated actions — may be incorrect, incomplete, or unsuitable. We assume no liability for damages arising from incorrect, incomplete, or misdirected automated actions, including wrong email categorisations, unintended data deletions, incorrect database entries, or actions that fail to execute. You are expressly responsible for reviewing all actions performed or proposed by the platform before and after execution.

By enabling automated workflows, you confirm you have understood how each automation works and accept responsibility for all actions it triggers on your systems and data.

Availability: For the Free plan no uptime guarantee is given. For Pro and Max plans we target 99% monthly availability. Maintenance windows will be announced with reasonable advance notice.

Outages caused by third-party service providers (in particular the Anthropic API, Google APIs, or Stripe) do not give rise to liability on our part.

The Service is provided "as is" and "as available". To the extent permitted by applicable law, we make no warranties, express or implied, regarding merchantability, fitness for a particular purpose, or non-infringement. Third-party services connected through Corelyx may become unavailable or change without notice — we are not responsible for this.

Liability cap: To the extent permitted by applicable law, our total liability to you for all claims arising from or related to the Service shall not exceed the greater of (a) three times your monthly subscription amount in the month the damage occurs, or (b) EUR 500.

This cap does not apply to damages caused by intent, gross negligence, personal injury, or where mandatory statutory rules preclude limitation. Liability for damages caused intentionally or by gross negligence cannot be limited under Austrian law (§ 6 KSchG for consumers; § 879 ABGB generally). Liability for personal injury or death caused by our fault cannot be limited. Statutory consumer rights under applicable EU directives are not affected.

For business customers (non-consumers), liability for slight negligence is excluded to the fullest extent permitted by Austrian commercial law.

If you are a consumer, nothing in this section affects your statutory rights under Austrian or applicable EU law, including rights to a conforming digital service under the EU Digital Content Directive (Directive 2019/770 as implemented in Austria).`,
  },
  {
    id: "third-party",
    title: "8. Third-Party Services and Credentials",
    content: `The Service integrates APIs and services from the following third-party providers:

- Anthropic Inc., 548 Market St, PMB 90375, San Francisco, CA 94104, USA — AI models
- Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA — Google Workspace APIs
- Stripe, Inc. — payment processing

The Service allows you to connect additional third-party accounts (such as Gmail, Slack, GitHub, Notion, and others) and to provide API keys for AI model providers. By doing so:

- You confirm you have the right to grant Corelyx the access you are configuring
- You are solely responsible for ensuring your use of third-party services through Corelyx complies with those services' terms and policies
- You acknowledge that Corelyx acts as your agent when accessing third-party services on your behalf; any actions taken by your Programs are your responsibility
- You are responsible for any costs incurred with third-party providers as a result of your Programs running

Their own privacy policies apply to data processed by these providers. By using the Service, you consent to data being transferred to these providers to the extent necessary to perform the automation you have configured.

Corelyx stores your credentials encrypted in Supabase Vault and accesses them only to execute your Programs. See our Privacy Policy for more detail.`,
  },
  {
    id: "content",
    title: "9. Your Content and Outputs",
    content: `You retain ownership of the Programs, prompts, and configurations you create in Corelyx ("Your Content"). By using the Service, you grant Corelyx a limited, non-exclusive license to store and execute Your Content solely for the purpose of providing the Service to you.

All outputs generated by the platform (categorisations, database entries, summaries, etc.) belong to you. We make no claim over this content.

We may use fully anonymised, non-attributable usage statistics (never content) to improve the platform. You may opt out of this at any time in your account settings.

You are solely responsible for ensuring Your Content and the automations you build do not violate any law, third-party rights, or these Terms.

We do not claim any ownership over data that flows through your Programs from third-party services.`,
  },
  {
    id: "ip",
    title: "10. Intellectual Property",
    content: `The Corelyx platform, including its software, design, trademarks, and documentation, is owned by Corelyx and protected by applicable intellectual property laws. These Terms do not grant you any rights in our intellectual property beyond the limited right to use the Service as described herein.

You may not copy, modify, reverse engineer, or create derivative works of any part of the Service.`,
  },
  {
    id: "changes",
    title: "11. Changes to These Terms",
    content: `We may update these Terms from time to time. For material changes, we will provide at least 30 days' notice by email or by displaying a prominent notice in the dashboard before the changes take effect.

If you do not object within 14 days of receiving notice of a material change, the updated Terms are deemed accepted. If you object, you may close your account before the effective date without penalty.

For business customers, a notice period of at least 14 days applies for material changes. Non-material clarifications or corrections may take effect immediately.`,
  },
  {
    id: "consumer-rights",
    title: "12. Consumer Rights and Dispute Resolution",
    content: `If you are a consumer within the meaning of Austrian or EU consumer law, the following additional provisions apply.

Statutory conformity rights: You are entitled to a digital service that conforms to what was agreed and is free from defects. If the Service is non-conforming, you may request remedy, a price reduction, or — where remedy is impossible or refused — termination of the contract, in accordance with the Austrian UGB and the EU Digital Content Directive (2019/770).

Mandatory consumer protections: Regardless of the governing law clause in Section 13, mandatory consumer protection rules of your country of residence within the EU or EEA apply where they afford greater protection.

Online Dispute Resolution: The European Commission provides an Online Dispute Resolution platform at https://ec.europa.eu/consumers/odr for resolving disputes relating to online purchases. Our contact address for ODR purposes is legal@corelyx.app. We are not obliged to participate in an alternative dispute resolution procedure, but we are willing to seek an amicable solution in the first instance.

Austrian consumer arbitration: Consumers may also contact the Austrian Internet Ombudsman (www.ombudsmann.at) or the Alternative Dispute Resolution body (AStG) relevant to their situation.`,
  },
  {
    id: "governing-law",
    title: "13. Governing Law and Jurisdiction",
    content: `These Terms are governed by the laws of the Republic of Austria, excluding its conflict-of-law rules. The UN Convention on Contracts for the International Sale of Goods (CISG) does not apply.

For disputes arising from these Terms or your use of the Service, the competent courts of Vienna, Austria have jurisdiction.

If you are a consumer resident in the European Union or the European Economic Area, you may also bring proceedings before the courts of your country of habitual residence. The mandatory consumer protection laws of your country of residence apply to the extent they afford greater protection than Austrian law and cannot be derogated from by agreement.`,
  },
  {
    id: "severability",
    title: "14. Severability",
    content: `If any provision of these Terms is or becomes wholly or partially invalid or unenforceable, the validity of the remaining provisions is not affected. The invalid provision shall be replaced by a valid provision that most closely achieves the economic purpose of the invalid one.`,
  },
  {
    id: "contact",
    title: "15. Contact",
    content: `For questions about these Terms, contact us at:

legal@corelyx.app

For privacy-related matters, see our Privacy Policy or email privacy@corelyx.app.`,
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
                  href="mailto:legal@corelyx.app"
                  className="text-primary hover:underline"
                >
                  legal@corelyx.app
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground/50 sm:flex-row">
          <span>(c) {new Date().getFullYear()} Corelyx. All rights reserved.</span>
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

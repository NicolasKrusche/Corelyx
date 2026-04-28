"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  Cable,
  Check,
  CirclePlay,
  Eye,
  FileText,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Users,
  Building2,
} from "lucide-react";

const INTEGRATIONS = [
  "Gmail",
  "Slack",
  "Notion",
  "GitHub",
  "Google Sheets",
  "Airtable",
  "HubSpot",
  "Asana",
  "Outlook",
  "Typeform",
  "Google Docs",
  "Google Drive",
];

const OPERATING_POINTS = [
  "GDPR-native by architecture",
  "Human approval gates built in",
  "Data never leaves the EU",
];

const WORKFLOW_STEPS = [
  {
    label: "Describe",
    title: "Write the outcome",
    body: "Start with a plain-language request. Corelyx turns intent into triggers, agent steps, connector calls, and GDPR-compliant data flows — generated entirely within EU infrastructure.",
  },
  {
    label: "Shape",
    title: "Inspect before you run",
    body: "Review the generated graph in a real editor. Move nodes, add human approval gates, verify the execution path. You define it. You approve it. You own it.",
  },
  {
    label: "Run",
    title: "Operate with a paper trail",
    body: "Launch manually, schedule work, or react to events. Every run produces an automatic Article 30 processing record and can pause for human review at any step.",
  },
];

const CONTROL_FEATURES = [
  {
    icon: ShieldCheck,
    title: "Human oversight — EU AI Act compliant",
    body: "Pause sensitive actions before they touch customer data or external systems. Every approval gate satisfies mandatory human oversight requirements under the EU AI Act.",
  },
  {
    icon: LockKeyhole,
    title: "Credentials never leave EU jurisdiction",
    body: "OAuth tokens and API keys are stored in Vault and resolved within Austrian/Frankfurt infrastructure. Zero transatlantic data transfers — not subject to the US CLOUD Act.",
  },
  {
    icon: Radio,
    title: "Event-aware automations",
    body: "Trigger from webhooks, cron schedules, provider events, manual starts, and program-to-program outputs — all logged, all auditable.",
  },
  {
    icon: Eye,
    title: "Full audit trail for regulatory review",
    body: "Inspect node status, payloads, failures, and skipped paths. Every run leaves a court-admissible log you can hand to a DPO without calling a consultant.",
  },
];

const COMPLIANCE_CARDS = [
  {
    icon: FileText,
    tag: "GDPR Art. 30",
    title: "Automatic processing records",
    body: "Every workflow run generates a Record of Processing Activity. Article 30 compliance happens automatically — not as a spreadsheet exercise after the fact.",
  },
  {
    icon: Users,
    tag: "EU AI Act",
    title: "Human-in-the-loop gates",
    body: "Built-in approval steps satisfy the EU AI Act's mandatory human oversight requirements. Deploy AI agents without legal exposure.",
  },
  {
    icon: Building2,
    tag: "Data residency",
    title: "Infrastructure stays in Europe",
    body: "Hosted in Austria and Frankfurt. Your data is never routed outside the EU — no transatlantic transfers, no US CLOUD Act exposure, no Privacy Shield uncertainty.",
  },
  {
    icon: ShieldCheck,
    tag: "GDPR Art. 28",
    title: "DPA included — one click",
    body: "Your Data Processing Agreement is ready to sign from day one. No legal back-and-forth, no 6-week procurement cycle. Ship your automation and stay compliant.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

function Reveal({
  children,
  className,
  i = 0,
}: {
  children: React.ReactNode;
  className?: string;
  i?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      custom={i}
      variants={fadeUp}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#090909] text-[#f6f0e8]">
      <SiteHeader />
      <HeroSection />
      <TrustBar />
      <WorkflowSection />
      <ControlSection />
      <ComplianceSection />
      <IntegrationsSection />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

function SiteHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#090909]/[0.88] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-7 w-7 object-contain" />
          <span className="text-base font-semibold text-white">Corelyx</span>
          <span className="hidden rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#b9b0a6] sm:inline">
            🇦🇹 Made in Austria
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-[#b9b0a6] md:flex">
          <a href="#workflow" className="transition-colors hover:text-white">Workflow</a>
          <a href="#compliance" className="transition-colors hover:text-white">Compliance</a>
          <a href="#integrations" className="transition-colors hover:text-white">Integrations</a>
          <Link href="/pricing" className="transition-colors hover:text-white">Pricing</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-md px-3 py-2 text-sm text-[#d5cec4] transition-colors hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#f05a28] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#ff7040]"
          >
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate min-h-[78svh] overflow-hidden px-4 pt-28 sm:px-6 lg:px-8">
      <HeroScene />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#090909] to-transparent" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-center pb-16 pt-8 sm:pt-14 lg:pb-20">
        <motion.p
          initial="hidden"
          animate="visible"
          custom={0}
          variants={fadeUp}
          className="mb-6 max-w-max border-l-2 border-[#f05a28] pl-3 text-sm font-medium text-[#d9d1c6]"
        >
          The AI automation platform that keeps your data in Europe.
        </motion.p>

        <motion.h1
          initial="hidden"
          animate="visible"
          custom={1}
          variants={fadeUp}
          className="max-w-4xl text-5xl font-semibold leading-none text-white sm:text-7xl lg:text-8xl"
        >
          Corelyx
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          custom={2}
          variants={fadeUp}
          className="mt-7 max-w-2xl text-lg leading-8 text-[#d7cfc3]"
        >
          Build agent workflows that are GDPR-ready by design — no legal review needed before you go live. Describe the job, inspect the graph, approve the run.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          custom={3}
          variants={fadeUp}
          className="mt-9 flex flex-col gap-3 sm:flex-row"
        >
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#111111] transition-colors hover:bg-[#efe8dd]"
          >
            Build a workflow
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/[0.18] bg-white/[0.06] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
          >
            <CirclePlay className="h-4 w-4" />
            Open workspace
          </Link>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          custom={4}
          variants={fadeUp}
          className="mt-8 grid max-w-2xl gap-3 text-sm text-[#c9c1b5] sm:grid-cols-3"
        >
          {OPERATING_POINTS.map((point) => (
            <div key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#75d7a3]" />
              <span>{point}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function HeroScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(115deg, rgba(9,9,9,0.98) 0%, rgba(9,9,9,0.82) 34%, rgba(9,9,9,0.42) 64%, rgba(9,9,9,0.84) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 80px), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 80px)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, x: 60, rotate: -10 }}
        animate={{ opacity: 1, x: 0, rotate: -7 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-[-260px] top-20 hidden h-[620px] w-[980px] lg:block"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 rounded-lg border border-white/[0.12] bg-[#121212]/[0.88] shadow-[0_34px_120px_rgba(0,0,0,0.55)]" />
          <div className="absolute left-0 right-0 top-0 flex h-12 items-center gap-2 border-b border-white/10 px-5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b47]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f0c15a]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#6fdc96]" />
            <span className="ml-4 text-xs text-[#9d9489]">program/run-console</span>
            <span className="ml-auto rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#9d9489]">
              🇦🇹 EU infrastructure
            </span>
          </div>

          <div className="absolute left-8 top-20 h-[460px] w-[590px]">
            <SceneNode className="left-0 top-8" tone="green" title="Gmail trigger" subtitle="new inbound lead" floatDelay={0} />
            <SceneNode className="left-[230px] top-0" tone="orange" title="Classify intent" subtitle="model: fast" floatDelay={0.6} />
            <SceneNode className="left-[445px] top-[78px]" tone="blue" title="CRM update" subtitle="HubSpot contact" floatDelay={1.2} />
            <SceneNode className="left-[156px] top-[230px]" tone="pink" title="Approval gate" subtitle="Art. 22 review" floatDelay={1.8} />
            <SceneNode className="left-[402px] top-[310px]" tone="green" title="Slack summary" subtitle="#sales-ops" floatDelay={0.9} />
            <DataLine className="left-[128px] top-[72px] w-[132px] rotate-[-12deg]" dotDelay={0} />
            <DataLine className="left-[352px] top-[68px] w-[116px] rotate-[28deg]" dotDelay={0.5} />
            <DataLine className="left-[250px] top-[196px] w-[142px] rotate-[33deg]" dotDelay={1.0} />
            <DataLine className="left-[292px] top-[320px] w-[132px] rotate-[14deg]" dotDelay={1.5} />
          </div>

          <div className="absolute right-8 top-20 w-[270px] rounded-lg border border-white/10 bg-[#191716] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-[#a99f93]">Run health</span>
              <span className="rounded bg-[#1f3a2b] px-2 py-1 text-xs text-[#82e6a8] flex items-center gap-1.5">
                <motion.span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#82e6a8]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                live
              </span>
            </div>
            <MetricRow label="Nodes complete" value="11 / 14" />
            <MetricRow label="Approvals waiting" value="1" />
            <MetricRow label="Art. 30 record" value="auto-filed" />
          </div>

          <div className="absolute bottom-8 right-8 w-[270px] rounded-lg border border-white/10 bg-[#111111] p-4">
            <div className="flex items-center gap-2 text-xs text-[#a99f93]">
              <KeyRound className="h-4 w-4 text-[#f05a28]" />
              EU-jurisdiction credential route
            </div>
            <div className="mt-4 space-y-2 font-mono text-[11px] text-[#8f877e]">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: 0 }}
              >
                vault.lookup(connection_id)
              </motion.p>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: 0.8 }}
              >
                proxy.execute(provider_action)
              </motion.p>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: 1.6 }}
              >
                return sanitized_result
              </motion.p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-[-1px] left-0 right-0 h-px bg-white/10" />
    </div>
  );
}

function SceneNode({
  className,
  tone,
  title,
  subtitle,
  floatDelay,
}: {
  className: string;
  tone: "green" | "orange" | "blue" | "pink";
  title: string;
  subtitle: string;
  floatDelay: number;
}) {
  const tones = {
    green: "border-[#75d7a3]/[0.35] bg-[#132218] text-[#75d7a3]",
    orange: "border-[#f05a28]/40 bg-[#271711] text-[#ff8a5f]",
    blue: "border-[#7fb7ff]/[0.35] bg-[#101b2a] text-[#9dc7ff]",
    pink: "border-[#f39ac2]/[0.35] bg-[#28141e] text-[#f6a7c7]",
  };

  return (
    <motion.div
      className={`absolute w-40 rounded-lg border p-3 shadow-[0_18px_44px_rgba(0,0,0,0.32)] ${tones[tone]} ${className}`}
      animate={{ y: [0, -7, 0] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs opacity-80">{subtitle}</p>
    </motion.div>
  );
}

function DataLine({ className, dotDelay }: { className: string; dotDelay: number }) {
  return (
    <div className={`absolute h-px bg-white/20 ${className}`}>
      <motion.span
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#f05a28]"
        style={{ left: 0 }}
        animate={{ left: ["0%", "100%"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "linear", delay: dotDelay, repeatDelay: 1 }}
      />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-3 last:mb-0 last:border-b-0 last:pb-0">
      <span className="text-xs text-[#8f877e]">{label}</span>
      <span className="font-mono text-sm text-white">{value}</span>
    </div>
  );
}

const TRUST_ITEMS = [
  { flag: "🇦🇹", text: "Hosted in Austria" },
  { flag: "🔒", text: "GDPR-native" },
  { flag: "⚖️", text: "EU AI Act ready" },
  { flag: "🚫", text: "No US data transfers" },
];

function TrustBar() {
  return (
    <section className="border-y border-white/10 bg-[#0d0d0c]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-0 divide-x divide-white/10 sm:justify-between">
        {TRUST_ITEMS.map((item) => (
          <div key={item.text} className="flex items-center gap-2.5 px-6 py-4 text-sm text-[#c9c1b5]">
            <span className="text-base leading-none">{item.flag}</span>
            <span className="font-medium">{item.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="bg-[#f3efe7] px-4 py-20 text-[#161412] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <Reveal>
            <SectionKicker>Workflow</SectionKicker>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              From plain-English request to a running, auditable workflow.
            </h2>
          </Reveal>
          <Reveal i={1}>
            <p className="max-w-2xl text-lg leading-8 text-[#5d554d]">
              Corelyx is built around a visual execution graph — so operators can see what was generated, where data moves, which steps need approval, and what happened afterward. No black boxes, no opaque job queues.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <Reveal key={step.label} i={index}>
              <article className="h-full rounded-lg border border-[#d8cfc2] bg-white p-6 transition-shadow hover:shadow-lg">
                <div className="mb-12 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#f05a28]">{step.label}</span>
                  <span className="font-mono text-sm text-[#8b8175]">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="mt-4 leading-7 text-[#62594f]">{step.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ControlSection() {
  return (
    <section id="control" className="bg-[#090909] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <SectionKicker dark>Control Plane</SectionKicker>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Built for operators who are accountable for what their agents do.
            </h2>
            <p className="mt-6 leading-8 text-[#c9c1b5]">
              Keep the fast parts fast. Put humans on the risky parts. Make every run legible for a regulator, a DPO, or your own post-mortem.
            </p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {CONTROL_FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} i={i * 0.5}>
                  <article className="h-full rounded-lg border border-white/10 bg-white/[0.045] p-6 transition-colors hover:bg-white/[0.07]">
                    <Icon className="h-5 w-5 text-[#f05a28]" />
                    <h3 className="mt-6 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-3 leading-7 text-[#bcb4aa]">{feature.body}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ComplianceSection() {
  return (
    <section id="compliance" className="bg-[#f3efe7] px-4 py-20 text-[#161412] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <p className="mb-2 text-sm font-semibold italic text-[#8b7b6a]">Vertrauen durch Transparenz</p>
          <SectionKicker>Compliance Without the Consultant</SectionKicker>
          <div className="mt-4 grid gap-6 lg:grid-cols-[0.9fr_1fr] lg:items-end">
            <h2 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              GDPR-compliant by architecture, not by checkbox.
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-[#5d554d]">
              Zapier, Make, and n8n were built for speed in a US context. Corelyx was designed from day one for the EU's data sovereignty requirements — so your legal team doesn't have to audit every automation you ship.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMPLIANCE_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} i={i * 0.15}>
                <article className="flex h-full flex-col rounded-lg border border-[#d8cfc2] bg-white p-6 transition-shadow hover:shadow-lg">
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f3efe7] border border-[#d8cfc2]">
                      <Icon className="h-5 w-5 text-[#f05a28]" />
                    </div>
                    <span className="rounded-full border border-[#d8cfc2] bg-[#f9f6f1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b7b6a]">
                      {card.tag}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{card.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-[#62594f]">{card.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal i={1}>
          <div className="mt-10 flex flex-wrap items-center gap-4 rounded-lg border border-[#d8cfc2] bg-white px-6 py-5">
            <div className="flex-1">
              <p className="text-sm font-semibold">Zero data exposure — GDPR Article 32 compliant</p>
              <p className="mt-0.5 text-sm text-[#62594f]">
                API keys and OAuth tokens are never returned to the frontend. All credential access goes through <span className="font-mono text-xs bg-[#f3efe7] px-1.5 py-0.5 rounded">getValidToken()</span> — a server-side route within EU jurisdiction. Your data doesn't touch our margins.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[#151210] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2a2520]"
            >
              Read the security model
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  const doubled = [...INTEGRATIONS, ...INTEGRATIONS];
  return (
    <section id="integrations" className="bg-[#151210] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <Reveal>
            <SectionKicker dark>Integrations</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
              Connect the tools your team already uses — without moving your data to the US.
            </h2>
          </Reveal>
          <Reveal i={1}>
            <Link
              href="/signup"
              className="inline-flex h-11 w-max items-center gap-2 rounded-md border border-white/[0.14] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Connect tools
              <Cable className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <div className="relative mt-12 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#151210] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#151210] to-transparent" />
          <div className="flex animate-marquee gap-3" style={{ width: "max-content" }}>
            {doubled.map((name, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-[#0d0d0d] px-5 py-4 text-sm text-[#d8d0c6] whitespace-nowrap"
              >
                {name}
              </div>
            ))}
          </div>
        </div>

        <Reveal i={1}>
          <p className="mt-8 text-sm text-[#7a7269]">
            All connector calls are proxied server-side through EU infrastructure. Third-party API calls never originate from the user&apos;s browser.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#f3efe7] px-4 py-20 text-[#151210] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <Reveal>
          <SectionKicker>Get started</SectionKicker>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Ship your first GDPR-compliant automation this week.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#62594f]">
            Start with a small operational task, inspect the generated graph, add approval gates where needed. DPA ready to sign. No legal review required before you go live.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-[#8b7b6a]">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-[#6abf8a]" /> Free to start</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-[#6abf8a]" /> DPA included</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-[#6abf8a]" /> Hosted in Austria 🇦🇹</span>
          </div>
        </Reveal>
        <Reveal i={1}>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#151210] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2520]"
            >
              Create an account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#cfc4b6] px-5 text-sm font-semibold text-[#151210] transition-colors hover:bg-white"
            >
              View pricing
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#090909] px-4 py-8 text-sm text-[#a9a096] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-80" />
            <span>© {new Date().getFullYear()} Corelyx</span>
          </div>
          <p className="text-xs text-[#6a6259]">🇦🇹 Made in Austria · Hosted in Austria &amp; Frankfurt · GDPR-native infrastructure</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/dpa" className="hover:text-white">DPA</Link>
          <Link href="/impressum" className="hover:text-white">Impressum</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function SectionKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-sm font-semibold uppercase tracking-wide ${dark ? "text-[#f05a28]" : "text-[#b9441e]"}`}>
      {children}
    </p>
  );
}

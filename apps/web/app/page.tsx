"use client";

import Link from "next/link";
import { motion, useInView, type Variants } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  Building2,
  Cable,
  Check,
  CirclePlay,
  Eye,
  FileText,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Users,
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
    label: "Define",
    title: "Describe the operational outcome",
    body: "Start from a plain-language request, a blank graph, or an existing workflow pattern. Corelyx turns the work into validated triggers, branches, connector calls, and approval points.",
  },
  {
    label: "Review",
    title: "Inspect the graph before it runs",
    body: "Operators can see where data moves, which systems are called, and which steps require a human decision. The visual graph stays tied to the executable schema.",
  },
  {
    label: "Operate",
    title: "Run with a traceable record",
    body: "Launch manually, schedule work, or respond to events. Each run keeps node status, outputs, failures, approvals, and compliance context in one place.",
  },
];

const CONTROL_FEATURES = [
  {
    icon: Users,
    title: "Approval queues",
    body: "Route sensitive actions to the right person before customer data is changed, messages are sent, or external systems are updated.",
  },
  {
    icon: KeyRound,
    title: "Credential boundary",
    body: "OAuth tokens and API keys are resolved through server-side helpers and Vault paths. Secrets are never returned to frontend responses.",
  },
  {
    icon: Radio,
    title: "Runtime visibility",
    body: "Follow each step through queued, running, completed, skipped, and failed states with enough context to debug the workflow later.",
  },
  {
    icon: Eye,
    title: "Reviewable execution history",
    body: "Inspect inputs, sanitized outputs, approvals, and connector outcomes without relying on scattered logs or manual screenshots.",
  },
];

const COMPLIANCE_CARDS = [
  {
    icon: FileText,
    tag: "GDPR Art. 30",
    title: "Processing records",
    body: "Workflow runs can produce structured processing records, so teams can explain what data moved, why it moved, and which systems were involved.",
  },
  {
    icon: Users,
    tag: "EU AI Act",
    title: "Human oversight",
    body: "Approval gates make it possible to pause high-impact actions before execution and preserve the decision history for later review.",
  },
  {
    icon: Building2,
    tag: "Data residency",
    title: "EU infrastructure focus",
    body: "Runtime and credential paths are designed around EU-hosted infrastructure, with connector calls routed through controlled server-side paths.",
  },
  {
    icon: ShieldCheck,
    tag: "GDPR Art. 28",
    title: "Procurement material",
    body: "DPA, subprocessor information, DPIA support, and data export documentation are available from the product rather than buried in sales cycles.",
  },
];

const GOVERNANCE_LINKS = [
  {
    href: "/dpa",
    title: "Data Processing Agreement",
    body: "Processor terms for procurement and privacy review.",
  },
  {
    href: "/subprocessors",
    title: "Subprocessor Registry",
    body: "A public inventory of infrastructure, model, and connector providers.",
  },
  {
    href: "/dpia-template",
    title: "DPIA Template",
    body: "A structured starting point for higher-risk automation assessments.",
  },
  {
    href: "/data-export-schema",
    title: "Data Export Schema",
    body: "Machine-readable account and workflow export documentation.",
  },
];

const TRUST_ITEMS = [
  { label: "EU-hosted runtime", detail: "Austrian and Frankfurt infrastructure" },
  { label: "Server-side credentials", detail: "Tokens never return to the browser" },
  { label: "Human approval gates", detail: "Pause sensitive steps before execution" },
  { label: "Run-level audit logs", detail: "Review status, payloads, and failures" },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" },
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/austria-heart-removebg.png" alt="Austria Flag" className="inline-block h-4 w-auto mr-1" /> Made in Austria
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-[#b9b0a6] md:flex">
          <a href="#workflow" className="transition-colors hover:text-white">Workflow</a>
          <a href="#compliance" className="transition-colors hover:text-white">Compliance</a>
          <a href="#integrations" className="transition-colors hover:text-white">Integrations</a>
          <Link href="/security" className="transition-colors hover:text-white">Security</Link>
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
            <AnchoredDataLine x1={160} y1={46} x2={230} y2={38} dotDelay={0} />
            <AnchoredDataLine x1={390} y1={38} x2={445} y2={116} dotDelay={0.5} />
            <AnchoredDataLine x1={310} y1={76} x2={236} y2={230} dotDelay={1} />
            <AnchoredDataLine x1={316} y1={268} x2={402} y2={348} dotDelay={1.5} />
            <SceneNode className="left-0 top-8" tone="green" title="Gmail trigger" subtitle="new inbound lead" floatDelay={0} />
            <SceneNode className="left-[230px] top-0" tone="orange" title="Classify intent" subtitle="model: fast" floatDelay={0.6} />
            <SceneNode className="left-[445px] top-[78px]" tone="blue" title="CRM update" subtitle="HubSpot contact" floatDelay={1.2} />
            <SceneNode className="left-[156px] top-[230px]" tone="pink" title="Approval gate" subtitle="Art. 22 review" floatDelay={1.8} />
            <SceneNode className="left-[402px] top-[310px]" tone="green" title="Slack summary" subtitle="#sales-ops" floatDelay={0.9} />
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
      className={`absolute z-10 flex h-[76px] w-40 flex-col justify-center rounded-lg border p-3 shadow-[0_18px_44px_rgba(0,0,0,0.32)] ${tones[tone]} ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 + floatDelay * 0.08, ease: "easeOut" }}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs opacity-80">{subtitle}</p>
    </motion.div>
  );
}

function AnchoredDataLine({
  x1,
  y1,
  x2,
  y2,
  dotDelay,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dotDelay: number;
}) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

  return (
    <div
      className="absolute z-0 h-px bg-white/20"
      style={{
        left: x1,
        top: y1,
        width: length,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
      }}
    >
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

function TrustBar() {
  return (
    <section className="border-y border-white/10 bg-[#0d0d0c]">
      <div className="mx-auto grid max-w-7xl gap-y-6 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label} className="border-l border-white/10 pl-4">
            <p className="text-sm font-semibold text-white">{item.label}</p>
            <p className="mt-1 text-sm leading-6 text-[#a9a096]">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="bg-[#f7f8fa] px-4 py-20 text-[#16181d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <Reveal>
            <SectionKicker>Workflow</SectionKicker>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              A visual graph with operational guardrails.
            </h2>
          </Reveal>
          <Reveal i={1}>
            <p className="max-w-2xl text-base leading-7 text-[#4f5863]">
              Corelyx uses the visual editor as the planning surface and the validated workflow schema as the execution contract. Teams can review what was generated before trusting it in production.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <Reveal key={step.label} i={index}>
              <article className="relative border-t border-[#cfd6df] pt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-sm font-semibold text-[#b9441e]">{step.label}</span>
                  <GitBranch className="h-4 w-4 text-[#8a94a3]" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-[#111317]">{step.title}</h3>
                <p className="mt-3 leading-7 text-[#58606b]">{step.body}</p>
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
    <section id="control" className="bg-[#171a20] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <SectionKicker dark>Control Plane</SectionKicker>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Built for teams that are accountable for automation.
            </h2>
            <p className="mt-6 max-w-xl leading-7 text-[#c7ced8]">
              Corelyx keeps routine steps fast and sensitive steps reviewable, with enough evidence to understand what happened after the run.
            </p>
          </Reveal>

          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {CONTROL_FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} i={i * 0.25}>
                  <article className="border-t border-white/10 pt-5">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-[#f27a4a]" />
                      <h3 className="text-base font-semibold">{feature.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#c7ced8]">{feature.body}</p>
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
    <section id="compliance" className="bg-white px-4 py-20 text-[#16181d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionKicker>Governance</SectionKicker>
          <div className="mt-4 grid gap-6 lg:grid-cols-[0.9fr_1fr] lg:items-end">
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Compliance material that stays close to the product.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[#4f5863]">
              Corelyx is designed for EU-facing workflow operations. The product supports DPA review, subprocessor visibility, DPIA preparation, data exports, and audit review without turning every workflow into a separate legal project.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 divide-y divide-[#dde2e8] border-y border-[#dde2e8]">
          {COMPLIANCE_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} i={i * 0.12}>
                <article className="grid gap-4 py-6 sm:grid-cols-[180px_1fr] sm:items-start lg:grid-cols-[180px_260px_1fr]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                      <Icon className="h-5 w-5 text-[#b9441e]" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#58606b]">{card.tag}</span>
                  </div>
                  <h3 className="text-base font-semibold leading-snug text-[#111317]">{card.title}</h3>
                  <p className="text-sm leading-6 text-[#58606b]">{card.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal i={1}>
          <div className="mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {GOVERNANCE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group border-t border-[#dde2e8] pt-4"
              >
                <p className="flex items-center justify-between gap-3 text-sm font-semibold text-[#111317]">
                  {item.title}
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#8a94a3] transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-2 text-sm leading-6 text-[#58606b]">{item.body}</p>
              </Link>
            ))}
          </div>
        </Reveal>

        <Reveal i={1.2}>
          <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-[#dde2e8] py-5">
            <LockKeyhole className="h-5 w-5 shrink-0 text-[#257b57]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#111317]">Credential access stays server-side.</p>
              <p className="mt-1 text-sm leading-6 text-[#58606b]">
                Connector calls use the established token and Vault helpers, so secrets are not sent to browser clients.
              </p>
            </div>
            <Link
              href="/security"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[#111317] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2a2f36]"
            >
              Security model
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
    <section id="integrations" className="bg-[#f7f8fa] px-4 py-20 text-[#16181d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <Reveal>
            <SectionKicker>Integrations</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Connect common work tools through a controlled runtime.
            </h2>
          </Reveal>
          <Reveal i={1}>
            <Link
              href="/signup"
              className="inline-flex h-11 w-max items-center gap-2 rounded-md bg-[#111317] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2a2f36]"
            >
              Connect tools
              <Cable className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <div className="relative mt-12 overflow-hidden border-y border-[#dde2e8] py-5">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#f7f8fa] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#f7f8fa] to-transparent" />
          <div className="flex animate-marquee items-center gap-8" style={{ width: "max-content" }}>
            {doubled.map((name, i) => (
              <div key={`${name}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
                <span className="text-base font-semibold text-[#313841]">{name}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#c2cad4]" />
              </div>
            ))}
          </div>
        </div>

        <Reveal i={1}>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-[#58606b]">
            Connector requests run server-side. Browser clients receive the result they need, not the credential material used to fetch it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-white px-4 py-16 text-[#16181d] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 border-t border-[#dde2e8] pt-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <Reveal>
          <SectionKicker>Get started</SectionKicker>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Build one controlled workflow, then expand from there.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-[#58606b]">
            Start with a recurring operational task, inspect the generated graph, and add approval steps where the workflow touches sensitive data or external systems.
          </p>
        </Reveal>
        <Reveal i={1}>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#e6531f] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#c94316]"
            >
              Create an account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#cfd6df] bg-white px-5 text-sm font-semibold text-[#111317] transition-colors hover:bg-[#eef2f6]"
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
    <footer className="border-t border-[#dde2e8] bg-white px-4 py-8 text-sm text-[#58606b] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain" />
            <span className="font-medium text-[#111317]">© {new Date().getFullYear()} Corelyx</span>
          </div>
          <p className="text-xs text-[#6b7480]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/austria-heart-removebg.png" alt="Austria Flag" className="inline-block h-3 w-auto mr-1" /> Built in Austria. Hosted in the EU.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-[#111317]">Pricing</Link>
          <Link href="/privacy" className="hover:text-[#111317]">Privacy</Link>
          <Link href="/terms" className="hover:text-[#111317]">Terms</Link>
          <Link href="/dpa" className="hover:text-[#111317]">DPA</Link>
          <Link href="/subprocessors" className="hover:text-[#111317]">Subprocessors</Link>
          <Link href="/security" className="hover:text-[#111317]">Security</Link>
          <Link href="/dpia-template" className="hover:text-[#111317]">DPIA</Link>
          <Link href="/data-export-schema" className="hover:text-[#111317]">Export schema</Link>
          <Link href="/impressum" className="hover:text-[#111317]">Impressum</Link>
          <Link href="/login" className="hover:text-[#111317]">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function SectionKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-sm font-semibold uppercase tracking-wide ${dark ? "text-[#f27a4a]" : "text-[#b9441e]"}`}>
      {children}
    </p>
  );
}

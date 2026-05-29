"use client";

import Link from "next/link";
import { motion, useInView, type Variants } from "framer-motion";
import { useRef } from "react";
import { legalIdentity } from "@/lib/legal";
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
  "EU-first automation infrastructure",
  "Human approval gates built in",
  "EU-only mode for eligible workflows",
];

const WORKFLOW_STEPS = [
  {
    num: "01",
    label: "Define",
    title: "Describe the operational outcome",
    body: "Start from a plain-language request, a blank graph, or an existing workflow pattern. Corelyx turns the work into validated triggers, branches, connector calls, and approval points.",
  },
  {
    num: "02",
    label: "Review",
    title: "Inspect the graph before it runs",
    body: "Operators can see where data moves, which systems are called, and which steps require a human decision. The visual graph stays tied to the executable schema.",
  },
  {
    num: "03",
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
    body: "Runtime and credential paths are designed around EU-first infrastructure, with EU-only controls for eligible workflows.",
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
  { label: "EU-first runtime", detail: "EU-only controls for eligible workflows" },
  { label: "Server-side credentials", detail: "Tokens never return to the browser" },
  { label: "Human approval gates", detail: "Pause sensitive steps before execution" },
  { label: "Run-level audit logs", detail: "Review status, payloads, and failures" },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" },
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
    <main className="min-h-screen overflow-x-hidden bg-white text-[#111318]">
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
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#07080a]/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-white">Corelyx</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-white/40 md:flex">
          <a href="#workflow" className="transition-colors hover:text-white/70">How it works</a>
          <a href="#compliance" className="transition-colors hover:text-white/70">Compliance</a>
          <a href="#integrations" className="transition-colors hover:text-white/70">Integrations</a>
          <Link href="/security" className="transition-colors hover:text-white/70">Security</Link>
          <Link href="/pricing" className="transition-colors hover:text-white/70">Pricing</Link>
          <a href="mailto:support@corelyx.app" className="transition-colors hover:text-white/70">Contact</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm text-white/40 transition-colors hover:text-white/70 sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f05a28] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#07080a] px-5 pt-28 pb-32 sm:px-8 sm:pt-36 sm:pb-40">
      {/* Subtle dot grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]"
      />
      {/* Orange glow top-center */}
      <div
        aria-hidden="true"
        className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#f05a28]/[0.07] blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid gap-16 lg:grid-cols-[1fr_520px] lg:items-center">
          {/* Left: text */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/40"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#75d7a3]" />
              EU-first · Made in Austria
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
              className="text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[56px]"
            >
              AI automation built
              <br />
              <span className="text-white/30">for GDPR compliance.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16, ease: "easeOut" }}
              className="mt-6 max-w-md text-base leading-7 text-white/40 sm:text-lg sm:leading-8"
            >
              Build agent workflows visually, inspect before running, and gate
              sensitive steps with human approval, audit trails, and explicit
              provider visibility.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111318] transition-colors hover:bg-white/90"
              >
                Build a workflow
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/70"
              >
                <CirclePlay className="h-4 w-4" />
                Open workspace
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-7 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
            >
              {OPERATING_POINTS.map((point) => (
                <div key={point} className="flex items-center gap-2 text-sm text-white/30">
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#75d7a3]" />
                  <span>{point}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: animated UI — desktop only */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <HeroCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HeroCard() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0f1014] p-1 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
      {/* Window chrome */}
      <div className="flex h-10 items-center gap-2 rounded-t-xl border-b border-white/[0.06] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b47]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f0c15a]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#6fdc96]/70" />
        <span className="ml-3 text-[11px] text-white/20">workflow / lead-ops / editor</span>
        <span className="ml-auto rounded border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#75d7a3]/60">
          🇦🇹 EU
        </span>
      </div>

      {/* Canvas */}
      <div className="relative h-[360px] overflow-hidden rounded-b-xl bg-[#0b0c0f]">
        {/* Grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px]"
        />

        {/* Flow lines */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 520 360"
        >
          <defs>
            <marker id="arr-g" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(117,215,163,0.5)" />
            </marker>
            <marker id="arr-o" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(240,90,40,0.5)" />
            </marker>
            <marker id="arr-b" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(127,183,255,0.5)" />
            </marker>
            <marker id="arr-p" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(243,154,194,0.5)" />
            </marker>
          </defs>
          <path d="M172,88 C210,88 210,148 248,148" stroke="rgba(117,215,163,0.3)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#arr-g)" className="edge-animate" />
          <path d="M172,88 C210,88 210,228 248,228" stroke="rgba(240,90,40,0.3)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#arr-o)" className="edge-animate" />
          <path d="M396,148 C430,148 430,148 450,148" stroke="rgba(127,183,255,0.3)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#arr-b)" className="edge-animate" />
          <path d="M396,228 C430,228 430,288 450,288" stroke="rgba(243,154,194,0.3)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#arr-p)" className="edge-animate" />
        </svg>

        {/* Nodes */}
        <FlowNode className="left-8 top-[60px]" tone="green" title="Gmail trigger" subtitle="new inbound lead" floatDelay={0} />
        <FlowNode className="left-[248px] top-[116px]" tone="orange" title="Classify intent" subtitle="model: fast" floatDelay={0.5} />
        <FlowNode className="left-[248px] top-[196px]" tone="blue" title="CRM update" subtitle="HubSpot contact" floatDelay={1} />
        <FlowNode className="left-[248px] top-[260px] opacity-50" tone="pink" title="Approval gate" subtitle="Art. 22 · waiting" floatDelay={1.5} />

        {/* Run panel */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="absolute right-4 top-4 w-[148px] rounded-xl border border-white/[0.08] bg-[#131417] p-3"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] text-white/30">Run health</span>
            <span className="flex items-center gap-1 rounded-full bg-[#1a3228] px-2 py-0.5 text-[10px] text-[#75d7a3]">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#75d7a3]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              live
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Complete", value: "11 / 14" },
              { label: "Waiting", value: "1" },
              { label: "Art. 30", value: "filed" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between border-b border-white/[0.05] pb-2.5 last:border-b-0 last:pb-0">
                <span className="text-[10px] text-white/25">{label}</span>
                <span className="font-mono text-[11px] text-white/60">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Credential banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="absolute bottom-4 right-4 w-[148px] rounded-xl border border-white/[0.08] bg-[#131417] p-3"
        >
          <div className="flex items-center gap-1.5 text-[10px] text-white/30">
            <KeyRound className="h-3 w-3 text-[#f05a28]/70" />
            EU-only policy route
          </div>
          <div className="mt-2.5 space-y-1.5 font-mono text-[9px] text-white/20">
            {["vault.lookup(id)", "proxy.execute(action)", "return sanitized"].map((line, i) => (
              <motion.p
                key={line}
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function FlowNode({
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
    green: "border-[#75d7a3]/20 bg-[#0f1c15]",
    orange: "border-[#f05a28]/20 bg-[#1a100a]",
    blue: "border-[#7fb7ff]/20 bg-[#0e1520]",
    pink: "border-[#f39ac2]/20 bg-[#1a0f17]",
  };
  const dots = {
    green: "bg-[#75d7a3]",
    orange: "bg-[#f05a28]",
    blue: "bg-[#7fb7ff]",
    pink: "bg-[#f39ac2]",
  };

  return (
    <motion.div
      className={`absolute z-10 w-[148px] rounded-xl border p-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] ${tones[tone]} ${className}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: [0, -4, 0] }}
      transition={{
        opacity: { duration: 0.4, delay: 0.2 + floatDelay * 0.1 },
        y: { duration: 6 + floatDelay, repeat: Infinity, ease: "easeInOut", delay: floatDelay * 0.5 },
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />
      </div>
      <p className="text-[11px] font-semibold text-white/80">{title}</p>
      <p className="mt-0.5 text-[10px] text-white/30">{subtitle}</p>
    </motion.div>
  );
}

function TrustBar() {
  return (
    <section className="border-b border-[#e8eaed] bg-white">
      <div className="mx-auto grid max-w-6xl gap-y-6 px-5 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {TRUST_ITEMS.map((item, i) => (
          <div key={item.label} className={i > 0 ? "lg:border-l lg:border-[#e8eaed] lg:pl-8" : ""}>
            <p className="text-sm font-semibold text-[#111318]">{item.label}</p>
            <p className="mt-1 text-sm text-[#6b7280]">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 text-sm font-medium text-[#f05a28]">How it works</p>
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
            A visual graph with operational guardrails.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#6b7280]">
            Corelyx uses the visual editor as the planning surface and the validated
            workflow schema as the execution contract. Teams can review what was
            generated before trusting it in production.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px bg-[#e8eaed] rounded-2xl overflow-hidden sm:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <Reveal key={step.label} i={index * 0.15}>
              <article className="bg-white p-8 h-full">
                <span className="font-mono text-xs font-medium text-[#d1d5db]">{step.num}</span>
                <h3 className="mt-5 text-base font-semibold text-[#111318]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#6b7280]">{step.body}</p>
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
    <section id="control" className="bg-[#f8f9fb] px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:items-start">
          <Reveal>
            <p className="mb-3 text-sm font-medium text-[#f05a28]">Control plane</p>
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              Built for teams accountable for automation.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-7 text-[#6b7280]">
              Corelyx keeps routine steps fast and sensitive steps reviewable,
              with enough evidence to understand what happened after the run.
            </p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2">
            {CONTROL_FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} i={i * 0.1}>
                  <article className="rounded-2xl border border-[#e8eaed] bg-white p-6">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff4f0]">
                      <Icon className="h-[18px] w-[18px] text-[#f05a28]" strokeWidth={1.75} />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-[#111318]">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b7280]">{feature.body}</p>
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
    <section id="compliance" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 text-sm font-medium text-[#f05a28]">Governance</p>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              Compliance material that stays close to the product.
            </h2>
            <p className="text-base leading-7 text-[#6b7280]">
              Corelyx is designed for EU-facing workflow operations. The product
              supports DPA review, subprocessor visibility, DPIA preparation, data
              exports, and audit review without turning every workflow into a
              separate legal project.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 divide-y divide-[#e8eaed]">
          {COMPLIANCE_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} i={i * 0.1}>
                <article className="grid gap-4 py-7 sm:grid-cols-[160px_1fr_2fr] sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#e8eaed] bg-[#f8f9fb] px-2.5 py-1 text-xs font-medium text-[#6b7280]">
                      {card.tag}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#111318]">{card.title}</h3>
                  <p className="text-sm leading-6 text-[#6b7280]">{card.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal i={0.5}>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {GOVERNANCE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-[#e8eaed] bg-[#f8f9fb] p-5 transition-colors hover:bg-[#f1f3f6]"
              >
                <p className="flex items-start justify-between gap-2 text-sm font-semibold text-[#111318]">
                  {item.title}
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">{item.body}</p>
              </Link>
            ))}
          </div>
        </Reveal>

        <Reveal i={0.7}>
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-[#e8eaed] bg-[#f8f9fb] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edfbf4]">
                <LockKeyhole className="h-4 w-4 text-[#257b57]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111318]">Credential access stays server-side.</p>
                <p className="mt-1 text-sm leading-6 text-[#6b7280]">
                  Connector calls use established token and Vault helpers. Secrets are never sent to browser clients.
                </p>
              </div>
            </div>
            <Link
              href="/security"
              className="inline-flex shrink-0 h-9 items-center gap-2 rounded-full bg-[#111318] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1f2329]"
            >
              Security model
              <ArrowRight className="h-3.5 w-3.5" />
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
    <section id="integrations" className="bg-[#f8f9fb] px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <Reveal>
            <p className="mb-3 text-sm font-medium text-[#f05a28]">Integrations</p>
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              Connect common work tools.
            </h2>
          </Reveal>
          <Reveal i={0.2}>
            <Link
              href="/signup"
              className="inline-flex h-10 w-max items-center gap-2 rounded-full bg-[#111318] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1f2329]"
            >
              Connect tools
              <Cable className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-2xl border border-[#e8eaed] bg-white py-5">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" />
          <div className="flex animate-marquee items-center gap-8 px-6" style={{ width: "max-content" }}>
            {doubled.map((name, i) => (
              <div key={`${name}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
                <span className="text-sm font-medium text-[#6b7280]">{name}</span>
                <span className="h-1 w-1 rounded-full bg-[#d1d5db]" />
              </div>
            ))}
          </div>
        </div>

        <Reveal i={0.3}>
          <p className="mt-6 max-w-lg text-sm leading-6 text-[#9ca3af]">
            Connector requests run server-side. Browser clients receive the result
            they need, not the credential material used to fetch it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#07080a] px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -mt-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[#f05a28]/[0.05] blur-3xl"
        />
        <div className="relative grid gap-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <Reveal>
            <p className="mb-4 text-sm font-medium text-[#f05a28]">Get started</p>
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              Build one controlled workflow, then expand.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/40">
              Start with a recurring operational task, inspect the generated graph,
              and add approval steps where the workflow touches sensitive data or
              external systems.
            </p>
          </Reveal>
          <Reveal i={0.2}>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111318] transition-colors hover:bg-white/90"
              >
                Create an account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/70"
              >
                View pricing
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[#e8eaed] bg-white px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-60" />
              <span className="text-sm font-semibold text-[#111318]">Corelyx</span>
            </div>
            <p className="mt-2 text-xs text-[#9ca3af]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/austria-heart-removebg.png" alt="Austria Flag" className="mr-1 inline-block h-3 w-auto" />
              Built in Austria · EU-first infrastructure
            </p>
            <p className="mt-1 text-xs text-[#9ca3af]">
              © {new Date().getFullYear()} {legalIdentity.entityName}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[#9ca3af]">
              Contracting entity: {legalIdentity.contractingEntity}. Responsible person:{" "}
              {legalIdentity.representative}.{" "}
              {legalIdentity.addressLines.length > 0
                ? `Registered address: ${legalIdentity.addressLines.join(", ")}.`
                : "Registered address: see Impressum."}{" "}
              Governing law: {legalIdentity.applicableLaw}.
            </p>
            <p className="mt-2 text-xs text-[#9ca3af]">
              <a href="mailto:support@corelyx.app" className="hover:text-[#6b7280] transition-colors">support@corelyx.app</a>
            </p>
          </div>

          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#6b7280]">
              <li><Link href="/pricing" className="transition-colors hover:text-[#111318]">Pricing</Link></li>
              <li><Link href="/trust" className="transition-colors hover:text-[#111318]">Trust Center</Link></li>
              <li><Link href="/docs" className="transition-colors hover:text-[#111318]">Docs</Link></li>
              <li><Link href="/gdpr" className="transition-colors hover:text-[#111318]">GDPR</Link></li>
              <li><Link href="/ai-act" className="transition-colors hover:text-[#111318]">AI Act</Link></li>
              <li><Link href="/compliance" className="transition-colors hover:text-[#111318]">Compliance</Link></li>
              <li><Link href="/templates" className="transition-colors hover:text-[#111318]">Templates</Link></li>
              <li><Link href="/compare" className="transition-colors hover:text-[#111318]">Compare</Link></li>
              <li><Link href="/guides" className="transition-colors hover:text-[#111318]">Guides</Link></li>
              <li><Link href="/blog" className="transition-colors hover:text-[#111318]">Blog</Link></li>
              <li><Link href="/integrations" className="transition-colors hover:text-[#111318]">Integrations</Link></li>
              <li><Link href="/use-cases" className="transition-colors hover:text-[#111318]">Use cases</Link></li>
              <li><Link href="/security" className="transition-colors hover:text-[#111318]">Security</Link></li>
              <li><Link href="/privacy" className="transition-colors hover:text-[#111318]">Privacy</Link></li>
              <li><Link href="/terms" className="transition-colors hover:text-[#111318]">Terms</Link></li>
              <li><Link href="/dpa" className="transition-colors hover:text-[#111318]">DPA</Link></li>
              <li><Link href="/subprocessors" className="transition-colors hover:text-[#111318]">Subprocessors</Link></li>
              <li><Link href="/dpia-template" className="transition-colors hover:text-[#111318]">DPIA</Link></li>
              <li><Link href="/data-export-schema" className="transition-colors hover:text-[#111318]">Export schema</Link></li>
              <li><Link href="/impressum" className="transition-colors hover:text-[#111318]">Impressum</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-[#111318]">Sign in</Link></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { motion, useInView, type Variants } from "framer-motion";
import { useRef } from "react";
import { legalIdentity } from "@/lib/legal";
import {
  ArrowRight,
  Bot,
  Building2,
  Cable,
  Check,
  Eye,
  FileText,
  Filter,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Plug,
  Radio,
  Repeat,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
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

// Outcome-focused value strip under the hero (honest — no fabricated logos).
const TRUST_ITEMS = [
  { label: "Describe it, it builds", detail: "Genesis turns plain language into a working graph" },
  { label: "Human-in-the-loop", detail: "Approvals gate sensitive steps before they run" },
  { label: "200+ integrations", detail: "Scoped, server-side connector access" },
  { label: "EU-hosted & auditable", detail: "Every run keeps a reviewable record" },
];

const HERO_POINTS = [
  "Describe it — Genesis builds the workflow",
  "Human approval on sensitive steps",
  "EU-hosted · credentials stay server-side",
];

const HOW_IT_WORKS = [
  {
    num: "01",
    title: "Describe the outcome",
    body: "Tell Genesis what you want in plain language. It drafts the triggers, steps, and approvals.",
  },
  {
    num: "02",
    title: "Review before it runs",
    body: "The graph is tied to the executable schema — what you see is exactly what runs.",
  },
  {
    num: "03",
    title: "Refine by asking",
    body: "Add a branch or tighten a permission in natural language. No rebuilding from scratch.",
  },
];

const USE_CASES = [
  {
    title: "Lead qualification & routing",
    body: "Classify inbound email, enrich it, and create the CRM record — with an approval before any outreach.",
  },
  {
    title: "Customer onboarding",
    body: "Kick off welcome sequences across Gmail, Slack, and Notion the moment a deal closes.",
  },
  {
    title: "Invoice & payment ops",
    body: "Watch Stripe events, reconcile, and notify finance — with a gate on anything sensitive.",
  },
  {
    title: "Support triage & escalation",
    body: "Categorize tickets, draft responses with AI, and route the edge cases to a person.",
  },
  {
    title: "Pipeline hygiene & reporting",
    body: "Deduplicate, sort, and roll up CRM data into a weekly digest — automatically.",
  },
  {
    title: "Content & social publishing",
    body: "Turn a brief into scheduled posts across your tools, with review before anything goes live.",
  },
];

const CORE_BENEFITS = [
  {
    title: "Predictable & reviewable",
    body: "The visual graph is the execution contract — inspect where data moves and which systems are called before it runs. Every run keeps status, inputs, sanitized outputs, and failures.",
  },
  {
    title: "Human-in-the-loop",
    body: "Route sensitive actions — sending messages, changing customer data, moving money — to the right person. High-impact steps pause until someone approves, and the decision is recorded.",
  },
  {
    title: "Composable, not rigid",
    body: "Branches, loops, transforms, AI steps, and bounded autonomous agent tasks — composed visually, validated automatically, and runnable on a schedule, a webhook, or an event.",
  },
];

// Merged building-blocks + deep-dive: one authoritative list of what you build with.
const BUILD_WITH = [
  {
    icon: Radio,
    label: "Triggers",
    body: "Start a workflow however the work actually arrives.",
    example: "cron · 200+ app events · webhook · manual · another workflow's output",
  },
  {
    icon: Plug,
    label: "App steps",
    body: "Call the 200+ tools your team already uses, with credentials resolved server-side through Vault.",
    example: "send a Slack message · create a HubSpot deal · append a Sheet · upload to S3",
  },
  {
    icon: Sparkles,
    label: "AI steps",
    body: "Extraction, classification, and writing — built-in or custom, with model choice across five providers (BYOK or platform credits).",
    example: "classify a ticket · extract fields · summarize a thread · draft a reply",
  },
  {
    icon: Bot,
    label: "Agent tasks",
    body: "A bounded autonomous tool-loop: capped iterations, allow-listed tools, approval before any write.",
    example: "research a company and draft a summary — without going off the rails",
  },
  {
    icon: Users,
    label: "Human-in-the-loop",
    body: "Approval checkpoints anywhere judgment is needed; the run pauses with full context until someone decides.",
    example: "approve before sending · before a CRM write · before an agent acts",
  },
  {
    icon: Webhook,
    label: "Webhooks",
    body: "Catch events from anything that can POST and trigger runs at a unique endpoint.",
    example: "form vendors · billing events · internal services",
  },
  {
    icon: Filter,
    label: "Data utilities",
    body: "Shape data between steps without writing glue code.",
    example: "transform · filter · parse JSON/CSV · deduplicate · sort",
  },
  {
    icon: ShieldCheck,
    label: "Governance & audit",
    body: "Every run produces a reviewable record on EU-hosted infrastructure.",
    example: "processing records · failure traces · approval history",
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
    tag: "AI inventory",
    title: "Automatic system records",
    body: "Every workflow becomes an AI system record with purpose, owners, models, data sources, risk, review status, and oversight state.",
  },
  {
    icon: Users,
    tag: "EU AI Act",
    title: "Risk and oversight",
    body: "Risk classification, recommended controls, and approval gates make high-impact AI workflows reviewable before action.",
  },
  {
    icon: Building2,
    tag: "Documentation",
    title: "Generated evidence",
    body: "Inventory records generate technical documentation, DPIA drafts, and governance exports instead of relying on scattered spreadsheets.",
  },
  {
    icon: ShieldCheck,
    tag: "Auditability",
    title: "Immutable review trail",
    body: "Runs, approvals, overrides, and governance events produce searchable evidence for audit and incident review.",
  },
];

const GOVERNANCE_LINKS = [
  { href: "/dpa", title: "Data Processing Agreement", body: "Processor terms for procurement and privacy review." },
  { href: "/subprocessors", title: "Subprocessor Registry", body: "A public inventory of infrastructure, model, and connector providers." },
  { href: "/dpia-template", title: "DPIA Template", body: "A structured starting point for higher-risk automation assessments." },
  { href: "/data-export-schema", title: "Data Export Schema", body: "Machine-readable account and workflow export documentation." },
];

// Social proof is implemented but gated OFF until real, attributable quotes and
// a real rating exist. Do NOT flip this to true with placeholder content — that
// would be fabricated social proof on a public page.
const SHOW_TESTIMONIALS = false;
const TESTIMONIALS = [
  { quote: "Saved our ops team about six hours a week in the first month.", role: "Founder, B2B SaaS" },
  { quote: "The first automation tool my non-technical team didn't need me to babysit.", role: "Automation engineer" },
  { quote: "I described the process and it built it. I edited two steps and shipped.", role: "Operations lead" },
  { quote: "Approvals mean I finally trust automation with customer data.", role: "Agency owner" },
  { quote: "EU hosting and audit logs got us through the security review fast.", role: "CTO" },
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm font-medium text-[#f05a28]">{children}</p>;
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#111318]">
      <SiteHeader />
      <HeroSection />
      <TrustBar />
      <HowItWorksSection />
      <UseCasesSection />
      <IntegrationsSection />
      <CoreBenefitsSection />
      <ControlSection />
      <BuildingBlocksSection />
      <VisualEditorSection />
      <ComplianceSection />
      <SocialProofSection />
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
          <a href="#how" className="transition-colors hover:text-white/70">How it works</a>
          <a href="#use-cases" className="transition-colors hover:text-white/70">Use cases</a>
          <a href="#integrations" className="transition-colors hover:text-white/70">Integrations</a>
          <Link href="/security" className="transition-colors hover:text-white/70">Security</Link>
          <Link href="/pricing" className="transition-colors hover:text-white/70">Pricing</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm text-white/40 transition-colors hover:text-white/70 sm:block"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f05a28] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start for free
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/austria-heart-removebg.png" alt="" aria-hidden className="h-3 w-auto" />
              EU-first · Made in Austria
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
              className="text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[56px]"
            >
              AI automation your
              <br />
              team will actually
              <br />
              <span className="text-white/30">trust.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16, ease: "easeOut" }}
              className="mt-6 max-w-md text-base leading-7 text-white/40 sm:text-lg sm:leading-8"
            >
              Describe what you want to automate in plain language. Corelyx turns
              it into a workflow you can see, review, and run — with humans in the
              loop wherever it matters.
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
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/70"
              >
                See how it works
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-7 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
            >
              {HERO_POINTS.map((point) => (
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

        {/* Flow lines — no viewBox so SVG units = CSS px 1:1. */}
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full">
          <defs>
            <marker id="arr-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(117,215,163,0.6)" />
            </marker>
            <marker id="arr-o" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(240,90,40,0.6)" />
            </marker>
            <marker id="arr-r" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(239,68,68,0.6)" />
            </marker>
            <marker id="arr-p" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(243,154,194,0.6)" />
            </marker>
          </defs>

          <path d="M180,88 C218,88 218,144 248,144"
            stroke="rgba(117,215,163,0.4)" strokeWidth="1.5" strokeDasharray="5,3" fill="none"
            markerEnd="url(#arr-g)" className="edge-animate" />
          <path d="M322,172 C322,180 322,188 322,196"
            stroke="rgba(240,90,40,0.55)" strokeWidth="1.5" strokeDasharray="5,3" fill="none"
            markerEnd="url(#arr-o)" className="edge-animate" />
          <path d="M248,155 C195,155 195,288 248,288"
            stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" strokeDasharray="5,3" fill="none"
            markerEnd="url(#arr-r)" className="edge-animate" />
          <path d="M396,288 C434,288 442,308 442,316"
            stroke="rgba(243,154,194,0.45)" strokeWidth="1.5" strokeDasharray="5,3" fill="none"
            markerEnd="url(#arr-p)" className="edge-animate" />
        </svg>

        {/* Nodes */}
        <FlowNode className="left-8 top-[60px]" tone="green" title="Gmail trigger" subtitle="new inbound lead" floatDelay={0} />
        <FlowNode className="left-[248px] top-[116px]" tone="orange" title="Classify intent" subtitle="model: fast" floatDelay={0.5} />
        <FlowNode className="left-[248px] top-[196px]" tone="blue" title="CRM update" subtitle="HubSpot contact" floatDelay={1} />
        <FlowNode className="left-[248px] top-[260px] opacity-50" tone="pink" title="Approval gate" subtitle="waiting · review" floatDelay={1.5} />

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
              { label: "Audited", value: "yes" },
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
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {/* Logo row goes here once real customer logos exist. */}
        <div className="grid gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map((item, i) => (
            <div key={item.label} className={i > 0 ? "lg:border-l lg:border-[#e8eaed] lg:pl-8" : ""}>
              <p className="text-sm font-semibold text-[#111318]">{item.label}</p>
              <p className="mt-1 text-sm text-[#6b7280]">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- In-code product mock visuals (no real screenshots available yet) ----

function MockChrome({ label, badge }: { label: string; badge?: React.ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-[#eceef1] bg-[#fbfcfd] px-4">
      <span className="h-2 w-2 rounded-full bg-[#ff6b57]/70" />
      <span className="h-2 w-2 rounded-full bg-[#f0c15a]/70" />
      <span className="h-2 w-2 rounded-full bg-[#6fdc96]/70" />
      <span className="ml-2 font-mono text-[11px] text-[#9ca3af]">{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

function GenesisGraphMock() {
  const nodes = [
    { label: "Gmail trigger", sub: "inbound lead", dot: "bg-[#75d7a3]" },
    { label: "Classify", sub: "intent · fast", dot: "bg-[#f0a33c]" },
    { label: "Approval", sub: "review", dot: "bg-[#f39ac2]" },
    { label: "HubSpot", sub: "create contact", dot: "bg-[#7fb7ff]" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e1e4e8] bg-[#fbfcfd] p-4 shadow-[0_1px_0_rgba(17,19,24,0.03),0_30px_60px_-30px_rgba(17,19,24,0.22)] sm:p-5">
      <div className="flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-white px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-[#f05a28]" />
        <span className="text-sm text-[#111318]">When a lead emails us, qualify it and add it to HubSpot</span>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-[#fff4f0] px-2.5 py-1 text-[11px] font-semibold text-[#f05a28] sm:inline-flex">
          Genesis
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {nodes.map((n, i) => (
          <div key={n.label} className="relative rounded-xl border border-[#e8eaed] bg-white p-3">
            <span className={`mb-2 block h-1.5 w-1.5 rounded-full ${n.dot}`} />
            <p className="text-[12px] font-semibold text-[#111318]">{n.label}</p>
            <p className="mt-0.5 text-[10px] text-[#9ca3af]">{n.sub}</p>
            {i < nodes.length - 1 && (
              <ArrowRight className="absolute -right-[11px] top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-[#d1d5db] sm:block" />
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 px-1 text-[11px] text-[#9ca3af]">
        <Check className="h-3.5 w-3.5 text-[#1f8a5b]" strokeWidth={2.5} />
        Generated &amp; validated · ready to review
      </p>
    </div>
  );
}

function RunMock() {
  const steps = [
    { tone: "done", title: "Gmail trigger", sub: "new inbound lead" },
    { tone: "done", title: "Classify intent", sub: "model · fast" },
    { tone: "wait", title: "Approval gate", sub: "waiting on you" },
    { tone: "queued", title: "HubSpot update", sub: "create contact" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e1e4e8] bg-white shadow-[0_1px_0_rgba(17,19,24,0.03),0_30px_60px_-30px_rgba(17,19,24,0.22)]">
      <MockChrome
        label="run / lead-ops · #1284"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eafaf2] px-2 py-0.5 text-[10px] font-medium text-[#1f8a5b]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1f8a5b]" />
            running
          </span>
        }
      />
      <div className="space-y-2 p-4">
        {steps.map((s) => (
          <div key={s.title} className="flex items-center gap-3 rounded-xl border border-[#eceef1] bg-[#fcfdfe] px-3 py-2.5">
            {s.tone === "done" && <Check className="h-4 w-4 shrink-0 text-[#1f8a5b]" strokeWidth={2.5} />}
            {s.tone === "wait" && <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full border-2 border-[#f0a33c]" />}
            {s.tone === "queued" && <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#d1d5db]" />}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#111318]">{s.title}</p>
              <p className="text-[11px] text-[#9ca3af]">{s.sub}</p>
            </div>
            {s.tone === "wait" && (
              <div className="ml-auto flex gap-1.5">
                <span className="rounded-md bg-[#111318] px-2 py-1 text-[10px] font-semibold text-white">Approve</span>
                <span className="rounded-md border border-[#e8eaed] px-2 py-1 text-[10px] font-medium text-[#6b7280]">Decline</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-[#eceef1] px-4 py-2.5 text-[11px] text-[#9ca3af]">
        <span>2 / 4 steps complete</span>
        <span className="font-medium text-[#f0a33c]">1 awaiting you</span>
      </div>
    </div>
  );
}

function LightNode({
  className,
  dot,
  title,
  sub,
}: {
  className: string;
  dot: string;
  title: string;
  sub: string;
}) {
  return (
    <div className={`absolute w-[124px] rounded-lg border border-[#e6e8eb] bg-white px-2.5 py-2 shadow-[0_4px_14px_rgba(17,19,24,0.06)] ${className}`}>
      <span className={`mb-1 block h-1.5 w-1.5 rounded-full ${dot}`} />
      <p className="text-[11px] font-semibold leading-tight text-[#111318]">{title}</p>
      <p className="mt-0.5 text-[10px] text-[#9ca3af]">{sub}</p>
    </div>
  );
}

function LightEditorMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e1e4e8] bg-white shadow-[0_1px_0_rgba(17,19,24,0.03),0_30px_60px_-30px_rgba(17,19,24,0.22)]">
      <MockChrome
        label="workflow / onboarding / editor"
        badge={<span className="rounded-md border border-[#e8eaed] bg-white px-2 py-0.5 text-[10px] text-[#9ca3af]">editing</span>}
      />
      <div className="relative h-[320px] overflow-hidden bg-[#fafbfc]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(17,19,24,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,19,24,0.03)_1px,transparent_1px)] bg-[size:28px_28px]"
        />
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full">
          <defs>
            <marker id="le-arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,1 L0,5 L5,3 z" fill="rgba(160,165,172,0.95)" />
            </marker>
          </defs>
          <path d="M130,150 C168,150 168,150 200,150" stroke="rgba(160,165,172,0.6)" strokeWidth="1.5" fill="none" markerEnd="url(#le-arr)" />
          <path d="M324,150 C348,150 348,76 372,76" stroke="rgba(117,215,163,0.55)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#le-arr)" />
          <path d="M324,150 C348,150 348,180 372,180" stroke="rgba(127,183,255,0.55)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#le-arr)" />
          <path d="M324,150 C348,150 348,262 372,262" stroke="rgba(243,154,194,0.55)" strokeWidth="1.5" strokeDasharray="5,3" fill="none" markerEnd="url(#le-arr)" />
        </svg>
        <LightNode className="left-6 top-[128px]" dot="bg-[#75d7a3]" title="Deal won" sub="HubSpot trigger" />
        <LightNode className="left-[200px] top-[128px]" dot="bg-[#f0a33c]" title="Branch" sub="enterprise?" />
        <LightNode className="left-[372px] top-[54px]" dot="bg-[#75d7a3]" title="Loop seats" sub="invite each user" />
        <LightNode className="left-[372px] top-[158px]" dot="bg-[#7fb7ff]" title="Welcome email" sub="Gmail · send" />
        <LightNode className="left-[372px] top-[240px]" dot="bg-[#f39ac2]" title="Approval" sub="manager sign-off" />
        <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-[#d8efe2] bg-[#f1faf5] px-2.5 py-0.5 text-[10px] font-medium text-[#1f8a5b]">
          <Check className="h-3 w-3" strokeWidth={2.5} />
          Schema valid
        </div>
      </div>
    </div>
  );
}

function AppTile({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[#e8eaed] bg-white px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f3f4f6] text-[11px] font-bold text-[#6b7280]">
        {name.slice(0, 1)}
      </span>
      <span className="truncate text-sm font-medium text-[#374151]">{name}</span>
    </div>
  );
}

function LogoGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {INTEGRATIONS.map((name) => (
        <AppTile key={name} name={name} />
      ))}
      <div className="flex items-center justify-center rounded-xl border border-dashed border-[#d6dae0] bg-[#f8f9fb] px-3 py-2.5 text-sm font-medium text-[#9ca3af]">
        + 190 more
      </div>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <section id="how" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionLabel>How it works</SectionLabel>
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
            Building an automation should feel like explaining it to a teammate.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#6b7280]">
            Genesis turns a plain-language request into a validated workflow. You
            stay in control — review the graph, then run it.
          </p>
        </Reveal>

        {/* Genesis prompt → generated graph visual */}
        <Reveal i={0.1}>
          <div className="mt-12">
            <GenesisGraphMock />
          </div>
        </Reveal>

        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-[#e8eaed] sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <Reveal key={step.num} i={index * 0.15}>
              <article className="h-full bg-white p-8">
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

function UseCasesSection() {
  return (
    <section id="use-cases" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="flex flex-col gap-4 border-b border-[#111318] pb-8 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              The processes that used to eat your week.
            </h2>
            <p className="max-w-xs text-sm leading-6 text-[#6b7280]">
              Whole operations, automated end to end — not just single tasks.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div>
            {USE_CASES.map((useCase, i) => (
              <Reveal key={useCase.title} i={(i % 3) * 0.08}>
                <div className="group flex gap-5 border-b border-[#eceef1] py-6">
                  <span className="font-mono text-sm tabular-nums text-[#d1d5db] transition-colors group-hover:text-[#f05a28]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-[#111318]">
                      {useCase.title}
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-[#f05a28] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b7280]">{useCase.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal i={0.15}>
            <div className="lg:sticky lg:top-24">
              <RunMock />
              <p className="mt-3 px-1 text-xs text-[#9ca3af]">
                A live run of “Lead qualification” — paused on the human approval step.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section id="integrations" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal>
            <SectionLabel>Integrations</SectionLabel>
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              Deeply integrated with 200+ of the apps you run on.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#6b7280]">
              Each connector exposes scoped operations — a workflow only gets the
              access it needs.
            </p>
          </Reveal>
          <Reveal i={0.2}>
            <Link
              href="/signup"
              className="inline-flex h-10 w-max items-center gap-2 rounded-full bg-[#111318] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1f2329]"
            >
              Connect your tools
              <Cable className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </div>

        <Reveal i={0.1}>
          <div className="mt-12">
            <LogoGrid />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CoreBenefitsSection() {
  return (
    <section className="relative overflow-hidden bg-[#07080a] px-5 py-24 sm:px-8 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#f05a28]/[0.06] blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-semibold leading-[1.15] tracking-tight text-white sm:text-4xl">
            Powerful where it counts.
            <br />
            <span className="text-white/30">Predictable everywhere else.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-y-10 lg:grid-cols-3 lg:gap-y-0">
          {CORE_BENEFITS.map((benefit, i) => (
            <Reveal key={benefit.title} i={i * 0.12}>
              <div className={i > 0 ? "lg:border-l lg:border-white/10 lg:pl-10" : "lg:pr-10"}>
                <span className="block h-1 w-7 rounded-full bg-[#f05a28]" />
                <h3 className="mt-6 text-lg font-semibold text-white">{benefit.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-7 text-white/45">{benefit.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ControlSection() {
  return (
    <section id="control" className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionLabel>Control plane</SectionLabel>
              <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
                Built for teams accountable for automation.
              </h2>
            </div>
            <p className="max-w-sm text-base leading-7 text-[#6b7280] lg:text-right">
              Routine steps stay fast. Sensitive steps stay reviewable. Every run
              leaves a record you can hand to whoever asks.
            </p>
          </div>
        </Reveal>

        {/* Control console */}
        <Reveal i={0.15}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-[#e1e4e8] bg-white shadow-[0_1px_0_rgba(17,19,24,0.03),0_30px_60px_-30px_rgba(17,19,24,0.22)]">
            {/* Console chrome */}
            <div className="flex items-center gap-2 border-b border-[#eceef1] bg-[#fbfcfd] px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f05a28]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f0c15a]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#6fdc96]/80" />
              <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9ca3af]">
                control · runtime · audit
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#d8efe2] bg-[#f1faf5] px-2.5 py-0.5 text-[11px] font-medium text-[#1f8a5b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1f8a5b]" />
                Operational
              </span>
            </div>

            {/* Capability rows — seam grid */}
            <div className="grid gap-px bg-[#eceef1] sm:grid-cols-2">
              {CONTROL_FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="group relative bg-white p-6 transition-colors hover:bg-[#fcfcfd] sm:p-7"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs tabular-nums text-[#c2c7cf]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="h-px flex-1 bg-[#f0f1f3]" />
                      <Icon className="h-4 w-4 text-[#f05a28]" strokeWidth={1.75} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold tracking-tight text-[#111318]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b7280]">{feature.body}</p>
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-[#f05a28] transition-transform duration-300 group-hover:scale-x-100"
                    />
                  </article>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BuildingBlocksSection() {
  return (
    <section id="building-blocks" className="bg-[#f8f9fb] px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[330px_1fr] lg:gap-16">
          <Reveal>
            <div className="lg:sticky lg:top-24">
              <SectionLabel>Building blocks</SectionLabel>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
                Everything you need to build, in one place.
              </h2>
              <p className="mt-4 max-w-sm text-base leading-7 text-[#6b7280]">
                A small set of primitives that compose into real systems — from a
                one-step alert to a multi-stage agent with approvals.
              </p>
              <Link
                href="/signup"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#f05a28] transition-colors hover:text-[#d44a1d]"
              >
                Start building
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>

          <div>
            {BUILD_WITH.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.label} i={(i % 4) * 0.06}>
                  <div className="flex gap-4 border-t border-[#e2e5e9] py-6 first:border-t-0 first:pt-0">
                    <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f05a28]" strokeWidth={1.75} />
                    <div>
                      <h3 className="text-base font-semibold text-[#111318]">{item.label}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-[#6b7280]">{item.body}</p>
                      <p className="mt-2 font-mono text-[11px] leading-5 text-[#9ca3af]">{item.example}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function VisualEditorSection() {
  const basics = [
    { icon: GitBranch, label: "Branches", note: "route on conditions" },
    { icon: Repeat, label: "Loops", note: "act on each item in a list" },
    { icon: Filter, label: "Filters", note: "stop runs that don't match" },
  ];
  const advanced = [
    "Chain workflows — one program's output triggers the next",
    "Shape data with transforms, parse, deduplicate, and sort",
    "Scoped delays between steps",
    "Approval gates on any step that touches sensitive data",
  ];

  return (
    <section className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-16">
          <Reveal>
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
              Precise control — without the tangled wiring diagram.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-[#6b7280]">
              The canvas stays readable as your logic grows, and the graph you
              build is the graph that runs.
            </p>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
              {basics.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[#f05a28]" strokeWidth={1.75} />
                    <span className="text-sm font-medium text-[#111318]">{item.label}</span>
                  </div>
                );
              })}
            </div>

            <ul className="mt-6 space-y-2.5">
              {advanced.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f05a28]" strokeWidth={2.25} />
                  <span className="text-sm leading-6 text-[#6b7280]">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal i={0.1}>
            <LightEditorMock />
          </Reveal>
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
          <SectionLabel>Governance</SectionLabel>
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
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f8f9fb]">
                      <Icon className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                    </span>
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

function SocialProofSection() {
  // Gated off until real, attributable testimonials and a real rating exist.
  if (!SHOW_TESTIMONIALS) return null;

  return (
    <section className="bg-white px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionLabel>Loved by the people who use it</SectionLabel>
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#111318] sm:text-4xl">
            Operators and engineers, same reaction.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial, i) => (
            <Reveal key={testimonial.role} i={(i % 3) * 0.1}>
              <figure className="h-full rounded-2xl border border-[#e8eaed] bg-[#f8f9fb] p-6">
                <blockquote className="text-sm leading-6 text-[#111318]">“{testimonial.quote}”</blockquote>
                <figcaption className="mt-4 text-xs font-medium text-[#9ca3af]">{testimonial.role}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#07080a] px-5 py-24 sm:px-8 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[#f05a28]/[0.06] blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <Reveal>
            <SectionLabel>Get started</SectionLabel>
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              Automate your first workflow today.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/40">
              Describe it in a sentence. Review the graph. Run it — with humans in
              the loop where it counts. Free plan, no credit card required.
            </p>
          </Reveal>
          <Reveal i={0.2}>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111318] transition-colors hover:bg-white/90"
              >
                Start for free
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

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Use cases", href: "/#use-cases" },
      { label: "Integrations", href: "/#integrations" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Workflows", href: "/#building-blocks" },
      { label: "Agent tasks", href: "/#building-blocks" },
      { label: "Approvals", href: "/#control" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Trust & legal",
    links: [
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "DPA", href: "/dpa" },
      { label: "Subprocessors", href: "/subprocessors" },
      { label: "DPIA", href: "/dpia-template" },
      { label: "Impressum", href: "/impressum" },
    ],
  },
];

function SiteFooter() {
  return (
    <footer className="border-t border-[#e8eaed] bg-white px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-60" />
              <span className="text-sm font-semibold text-[#111318]">Corelyx</span>
            </div>
            <p className="mt-3 max-w-[220px] text-sm leading-6 text-[#6b7280]">
              AI workflow automation built for GDPR compliance.
            </p>
            <p className="mt-4 text-xs text-[#9ca3af]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/austria-heart-removebg.png" alt="Austria Flag" className="mr-1 inline-block h-3 w-auto" />
              Built in Austria · EU-first infrastructure
            </p>
            <p className="mt-3 text-xs text-[#9ca3af]">
              <a href="mailto:support@corelyx.app" className="transition-colors hover:text-[#6b7280]">support@corelyx.app</a>
            </p>
            <a
              href="https://instagram.com/corelyx"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8eaed] text-[#9ca3af] transition-colors hover:border-[#d1d5db] hover:text-[#111318]"
              aria-label="Corelyx on Instagram"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`${col.title} links`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
                {col.title}
              </p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#6b7280] transition-colors hover:text-[#111318]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-2 border-t border-[#e8eaed] pt-6">
          <p className="text-xs text-[#9ca3af]">
            &copy; {new Date().getFullYear()} {legalIdentity.entityName}. All rights reserved.
          </p>
          <p className="max-w-3xl text-xs leading-5 text-[#9ca3af]">
            Contracting entity: {legalIdentity.contractingEntity}. Responsible person:{" "}
            {legalIdentity.representative}.{" "}
            {legalIdentity.addressLines.length > 0
              ? `Registered address: ${legalIdentity.addressLines.join(", ")}.`
              : "Registered address: see Impressum."}{" "}
            Governing law: {legalIdentity.applicableLaw}.
          </p>
        </div>
      </div>
    </footer>
  );
}

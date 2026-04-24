import Link from "next/link";
import {
  ArrowRight,
  Cable,
  Check,
  CirclePlay,
  Eye,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
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
  "Prompt-built workflow graphs",
  "Server-side OAuth and key storage",
  "Live runs, approvals, and logs",
];

const WORKFLOW_STEPS = [
  {
    label: "Describe",
    title: "Write the outcome",
    body: "Start with a plain-language request. Nexflow turns intent into triggers, agent steps, connector calls, and validation checks.",
  },
  {
    label: "Shape",
    title: "Inspect the graph",
    body: "Review the generated program in a real editor. Move nodes, swap tools, add approvals, and keep the execution path legible.",
  },
  {
    label: "Run",
    title: "Operate with control",
    body: "Launch manually, schedule work, or react to events. Every run leaves an audit trail and can pause for human approval.",
  },
];

const CONTROL_FEATURES = [
  {
    icon: ShieldCheck,
    title: "Approval gates",
    body: "Pause sensitive actions before they touch customer data, external systems, or expensive model calls.",
  },
  {
    icon: LockKeyhole,
    title: "Secrets stay server-side",
    body: "OAuth tokens and API keys are routed through protected backend paths instead of being exposed to the browser.",
  },
  {
    icon: Radio,
    title: "Event-aware automations",
    body: "Run from webhooks, cron schedules, provider events, manual starts, and program-to-program outputs.",
  },
  {
    icon: Eye,
    title: "Readable execution",
    body: "Inspect node status, payloads, failures, logs, and skipped paths without decoding a black-box job queue.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#090909] text-[#f6f0e8]">
      <SiteHeader />
      <HeroSection />
      <OperatingStrip />
      <WorkflowSection />
      <ControlSection />
      <IntegrationsSection />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#090909]/[0.88] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-7 w-7 object-contain" />
          <span className="text-base font-semibold text-white">Nexflow</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-[#b9b0a6] md:flex">
          <a href="#workflow" className="transition-colors hover:text-white">Workflow</a>
          <a href="#control" className="transition-colors hover:text-white">Control</a>
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
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate min-h-[78svh] overflow-hidden px-4 pt-28 sm:px-6 lg:px-8">
      <HeroScene />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#090909] to-transparent" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-center pb-16 pt-8 sm:pt-14 lg:pb-20">
        <p className="mb-6 max-w-max border-l-2 border-[#f05a28] pl-3 text-sm font-medium text-[#d9d1c6]">
          AI workflow automation for teams that need agents to run real work.
        </p>

        <h1 className="max-w-4xl text-5xl font-semibold leading-none text-white sm:text-7xl lg:text-8xl">
          Nexflow
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-8 text-[#d7cfc3]">
          Build, inspect, and operate agent workflows across your tools. Describe the job, review the graph, then run it with approvals, logs, and protected credentials.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#111111] transition-colors hover:bg-[#efe8dd]"
          >
            Build a program
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/[0.18] bg-white/[0.06] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
          >
            <CirclePlay className="h-4 w-4" />
            Open workspace
          </Link>
        </div>

        <div className="mt-8 grid max-w-2xl gap-3 text-sm text-[#c9c1b5] sm:grid-cols-3">
          {OPERATING_POINTS.map((point) => (
            <div key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#75d7a3]" />
              <span>{point}</span>
            </div>
          ))}
        </div>
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

      <div className="absolute right-[-260px] top-20 hidden h-[620px] w-[980px] rotate-[-7deg] lg:block">
        <div className="absolute inset-0 rounded-lg border border-white/[0.12] bg-[#121212]/[0.88] shadow-[0_34px_120px_rgba(0,0,0,0.55)]" />
        <div className="absolute left-0 right-0 top-0 flex h-12 items-center gap-2 border-b border-white/10 px-5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b47]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f0c15a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#6fdc96]" />
          <span className="ml-4 text-xs text-[#9d9489]">program/run-console</span>
        </div>

        <div className="absolute left-8 top-20 h-[460px] w-[590px]">
          <SceneNode className="left-0 top-8" tone="green" title="Gmail trigger" subtitle="new inbound lead" />
          <SceneNode className="left-[230px] top-0" tone="orange" title="Classify intent" subtitle="model: fast" />
          <SceneNode className="left-[445px] top-[78px]" tone="blue" title="CRM update" subtitle="HubSpot contact" />
          <SceneNode className="left-[156px] top-[230px]" tone="pink" title="Approval gate" subtitle="manager review" />
          <SceneNode className="left-[402px] top-[310px]" tone="green" title="Slack summary" subtitle="#sales-ops" />
          <DataLine className="left-[128px] top-[72px] w-[132px] rotate-[-12deg]" />
          <DataLine className="left-[352px] top-[68px] w-[116px] rotate-[28deg]" />
          <DataLine className="left-[250px] top-[196px] w-[142px] rotate-[33deg]" />
          <DataLine className="left-[292px] top-[320px] w-[132px] rotate-[14deg]" />
        </div>

        <div className="absolute right-8 top-20 w-[270px] rounded-lg border border-white/10 bg-[#191716] p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-[#a99f93]">Run health</span>
            <span className="rounded bg-[#1f3a2b] px-2 py-1 text-xs text-[#82e6a8]">live</span>
          </div>
          <MetricRow label="Nodes complete" value="11 / 14" />
          <MetricRow label="Approvals waiting" value="1" />
          <MetricRow label="Avg. runtime" value="18s" />
        </div>

        <div className="absolute bottom-8 right-8 w-[270px] rounded-lg border border-white/10 bg-[#111111] p-4">
          <div className="flex items-center gap-2 text-xs text-[#a99f93]">
            <KeyRound className="h-4 w-4 text-[#f05a28]" />
            Server-side credential route
          </div>
          <div className="mt-4 space-y-2 font-mono text-[11px] text-[#8f877e]">
            <p>vault.lookup(connection_id)</p>
            <p>proxy.execute(provider_action)</p>
            <p>return sanitized_result</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[-1px] left-0 right-0 h-px bg-white/10" />
    </div>
  );
}

function SceneNode({
  className,
  tone,
  title,
  subtitle,
}: {
  className: string;
  tone: "green" | "orange" | "blue" | "pink";
  title: string;
  subtitle: string;
}) {
  const tones = {
    green: "border-[#75d7a3]/[0.35] bg-[#132218] text-[#75d7a3]",
    orange: "border-[#f05a28]/40 bg-[#271711] text-[#ff8a5f]",
    blue: "border-[#7fb7ff]/[0.35] bg-[#101b2a] text-[#9dc7ff]",
    pink: "border-[#f39ac2]/[0.35] bg-[#28141e] text-[#f6a7c7]",
  };

  return (
    <div className={`absolute w-40 rounded-lg border p-3 shadow-[0_18px_44px_rgba(0,0,0,0.32)] ${tones[tone]} ${className}`}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs opacity-80">{subtitle}</p>
    </div>
  );
}

function DataLine({ className }: { className: string }) {
  return (
    <div className={`absolute h-px bg-white/20 ${className}`}>
      <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#f05a28]" />
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

function OperatingStrip() {
  return (
    <section className="border-y border-white/10 bg-[#10100f] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 text-sm text-[#cfc6ba] md:grid-cols-3">
        {[
          ["12+", "native connectors"],
          ["0", "frontend secrets returned"],
          ["1 graph", "from prompt to production"],
        ].map(([value, label]) => (
          <div key={label} className="flex items-baseline justify-between border-white/10 md:border-r md:pr-6 md:last:border-r-0">
            <span className="text-2xl font-semibold text-white">{value}</span>
            <span>{label}</span>
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
          <div>
            <SectionKicker>Workflow</SectionKicker>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              Move from idea to running system without losing the shape of the work.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-[#5d554d]">
            Nexflow is built around a visual execution graph, so operators can see what was generated, where data moves, and which steps need approval before anything runs.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <article key={step.label} className="rounded-lg border border-[#d8cfc2] bg-white p-6">
              <div className="mb-12 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#f05a28]">{step.label}</span>
                <span className="font-mono text-sm text-[#8b8175]">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="mt-4 leading-7 text-[#62594f]">{step.body}</p>
            </article>
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
          <div>
            <SectionKicker dark>Control Plane</SectionKicker>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              A workflow engine that behaves like infrastructure, not a demo.
            </h2>
            <p className="mt-6 leading-8 text-[#c9c1b5]">
              Keep the fast parts fast, put humans on the risky parts, and make every run legible after the fact.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {CONTROL_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-6">
                  <Icon className="h-5 w-5 text-[#f05a28]" />
                  <h3 className="mt-6 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 leading-7 text-[#bcb4aa]">{feature.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section id="integrations" className="bg-[#151210] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <SectionKicker dark>Integrations</SectionKicker>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
              Your agents can work where your team already works.
            </h2>
          </div>
          <Link
            href="/signup"
            className="inline-flex h-11 w-max items-center gap-2 rounded-md border border-white/[0.14] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Connect tools
            <Cable className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {INTEGRATIONS.map((name) => (
            <div key={name} className="rounded-lg border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm text-[#d8d0c6]">
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#f3efe7] px-4 py-20 text-[#151210] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <SectionKicker>Launch</SectionKicker>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Build the first workflow your team can actually understand.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#62594f]">
            Start with a small operational task, inspect the generated graph, then add approvals and connectors as the workflow earns trust.
          </p>
        </div>
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
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#090909] px-4 py-8 text-sm text-[#a9a096] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-80" />
          <span>© {new Date().getFullYear()} Nexflow</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/impressum" className="hover:text-white">Impressum</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function SectionKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-sm font-semibold uppercase ${dark ? "text-[#f05a28]" : "text-[#b9441e]"}`}>
      {children}
    </p>
  );
}

import Link from "next/link";
import { InteractiveFlowDiagram } from "@/components/landing/interactive-flow-diagram";
import { ForcedOrangeTheme } from "@/components/forced-orange-theme";

const CONNECTORS = [
  "Gmail", "Slack", "Notion", "GitHub", "Google Sheets",
  "Airtable", "HubSpot", "Asana", "Outlook", "Typeform",
  "Google Docs", "Google Drive",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const marqueeItems = [...CONNECTORS, ...CONNECTORS];

  return (
    <div className="light accent-orange min-h-screen bg-[#eceff4] text-foreground overflow-x-hidden">
      <ForcedOrangeTheme />

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-6 w-6 object-contain" />
            <span className="font-bold text-sm tracking-tight">Nexflow</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors md:hidden">Pricing</Link>
            <Link href="/login" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 sm:px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_28px_rgba(249,115,22,0.45)] transition-all duration-200">
              <span className="hidden sm:inline">Get started free</span>
              <span className="sm:hidden">Get started</span>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center text-center px-6 pt-24 pb-12 overflow-hidden min-h-[92vh] justify-center">
        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0 bg-grid-dots opacity-20" />

        {/* Edge masks — fade node clusters at viewport edges */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-52 bg-gradient-to-r from-[#eceff4] to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-52 bg-gradient-to-l from-[#eceff4] to-transparent z-10" />

        {/* Bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#eceff4] to-transparent" />

        {/* Badge */}
        <div className="animate-fade-up relative z-10 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 backdrop-blur-sm px-4 py-1.5 text-xs font-medium text-primary mb-8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          12 native integrations · Now in beta
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up-delay-1 relative z-10 font-black tracking-tight leading-[1.0] max-w-4xl" style={{ fontSize: "clamp(36px, 6vw, 68px)" }}>
          Your team just got
          <br />
          <span className="bg-gradient-to-br from-orange-300 via-orange-400 to-red-500 bg-clip-text text-transparent">
            an AI workforce.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-up-delay-2 relative z-10 mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
          Describe an automation in plain English. Nexflow builds the agent graph,
          connects your tools, and runs it — on autopilot.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up-delay-3 relative z-10 mt-9 flex flex-col sm:flex-row items-center gap-3">
          <Link href="/signup" className="group inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:shadow-[0_0_56px_rgba(249,115,22,0.65)] transition-all duration-300">
            Start for free
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 backdrop-blur-sm px-8 py-3.5 text-sm font-medium hover:bg-white transition-all duration-200">
            Sign in
          </Link>
        </div>

        {/* Trust signals */}
        <div className="animate-fade-up-delay-3 relative z-10 mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground/60">
          {["Free to start", "No credit card", "2 programs forever free"].map((item, i) => (
            <span key={item} className="flex items-center gap-1.5">
              {i > 0 && <span className="w-px h-3 bg-border/80 mr-4" />}
              <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 text-green-500">
                <path fillRule="evenodd" d="M10.5 2.5a.75.75 0 0 1 .166.913l-4 6a.75.75 0 0 1-1.153.098l-2.5-2.5a.75.75 0 0 1 1.06-1.06l1.89 1.889 3.464-5.196a.75.75 0 0 1 1.073-.144Z" clipRule="evenodd" />
              </svg>
              {item}
            </span>
          ))}
        </div>

        {/* Product diagram */}
        <div className="animate-fade-up-delay-4 relative z-10 mt-16 w-full max-w-4xl">
          <div className="absolute inset-x-8 top-6 bottom-0 -z-10 blur-[50px] rounded-full opacity-60"
            style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.3) 0%, rgba(168,85,247,0.15) 50%, transparent 80%)" }} />
          <div className="rounded-2xl overflow-hidden border border-border shadow-[0_8px_48px_rgba(0,0,0,0.12)]">
            <InteractiveFlowDiagram />
          </div>
        </div>
      </section>

      {/* ── Connector marquee ── */}
      <section id="integrations" className="border-y border-border/40 py-10 overflow-hidden">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 mb-7">
          Connects to your entire stack
        </p>
        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#eceff4] to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#eceff4] to-transparent z-10" />
          <div className="flex gap-3 animate-marquee whitespace-nowrap">
            {marqueeItems.map((name, i) => (
              <span key={`${name}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground/70 shrink-0">
                <span className="w-1 h-1 rounded-full bg-primary/60 shrink-0" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-3">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">Three steps.</h2>
            <p className="text-muted-foreground mt-4 text-base max-w-sm mx-auto">From idea to running automation in under a minute.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01", title: "Describe",
                body: 'Type what you want in plain English — "Summarize new GitHub issues and post to Slack."',
                tag: "TRIGGER", color: "text-orange-400", border: "border-orange-500/20", bg: "bg-orange-500/5",
              },
              {
                step: "02", title: "Design",
                body: "Nexflow generates a full agent graph. Tune prompts, swap models, rewire connections — visually.",
                tag: "AGENT", color: "text-purple-400", border: "border-purple-500/20", bg: "bg-purple-500/5",
              },
              {
                step: "03", title: "Deploy",
                body: "Hit Run. Triggers fire automatically, logs stream live, and approvals pause execution when you need control.",
                tag: "STEP", color: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/5",
              },
            ].map((item) => (
              <div key={item.step} className={`relative rounded-2xl border ${item.border} ${item.bg} p-7 flex flex-col gap-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black text-foreground/10">{item.step}</span>
                  <span className={`text-[9px] font-bold tracking-widest font-mono ${item.color} border ${item.border} rounded px-1.5 py-0.5`}>{item.tag}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features bento ── */}
      <section id="features" className="py-20 px-6 border-t border-border/40">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-3">Features</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">Built for production.</h2>
            <p className="text-muted-foreground mt-4 text-base max-w-sm mx-auto">Everything you need — nothing you don&apos;t.</p>
          </div>

          {/* Bento grid — 3 columns, alternating wide/narrow */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Row 1: wide + narrow */}
            <div className="group sm:col-span-2 relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-orange-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-orange-500/20 bg-orange-500/8 text-orange-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">AI-Designed Graphs</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">Type a sentence. Nexflow generates a complete, runnable agent graph — nodes, edges, prompts, and connections already wired up.</p>
              </div>
            </div>

            <div className="group relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-purple-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-purple-500/20 bg-purple-500/8 text-purple-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">Visual Editor</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Rearrange nodes, tune prompts, swap models, rewire connections — no config files.</p>
              </div>
            </div>

            {/* Row 2: narrow + wide */}
            <div className="group relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-yellow-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-yellow-500/20 bg-yellow-500/8 text-yellow-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">Runs on Autopilot</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Schedule runs, react to webhooks, chain programs — no infrastructure.</p>
              </div>
            </div>

            <div className="group sm:col-span-2 relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-green-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-green-500/20 bg-green-500/8 text-green-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">Secrets Stay Secret</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">OAuth tokens and API keys are encrypted in Vault and never returned to the frontend. Every model call routes through a server-side proxy — always.</p>
              </div>
            </div>

            {/* Row 3: wide + narrow */}
            <div className="group sm:col-span-2 relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-blue-500/20 bg-blue-500/8 text-blue-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">Human-in-the-Loop</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">Pause execution at any node and wait for your sign-off before proceeding. Perfect for high-stakes actions. Get email notifications, approve from anywhere.</p>
              </div>
            </div>

            <div className="group relative rounded-2xl border border-border bg-card p-8 flex flex-col gap-4 overflow-hidden hover:border-rose-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl border border-rose-500/20 bg-rose-500/8 text-rose-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                </svg>
              </div>
              <div className="relative">
                <h3 className="font-bold text-base mb-2">Live Visualization</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Nodes light up in real time. Active edges pulse. Errors surface inline.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/50">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-4 w-4 object-contain opacity-35" />
            <span>© {new Date().getFullYear()} Nexflow. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

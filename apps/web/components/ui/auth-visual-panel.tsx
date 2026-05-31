import { BarChart3, Flower2, Radar, Search } from "lucide-react";

const cards = [
  {
    title: "Competitive Research",
    subtitle: "Generate regular competitor analysis reports",
    icon: Flower2,
    tone: "from-emerald-100 to-emerald-50 text-emerald-700 border-emerald-200/80 dark:from-emerald-900/30 dark:to-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
  },
  {
    title: "Lead Qualifier",
    subtitle: "Enrich and qualify incoming leads",
    icon: Radar,
    tone: "from-sky-100 to-blue-50 text-blue-700 border-blue-200/80 dark:from-sky-900/30 dark:to-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
  },
  {
    title: "User Researcher",
    subtitle: "Synthesize feedback into product insights",
    icon: Search,
    tone: "from-orange-100 to-amber-50 text-orange-700 border-orange-200/80 dark:from-orange-900/30 dark:to-amber-950/40 dark:text-orange-300 dark:border-orange-800/40",
  },
] as const;

export function AuthVisualPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden lg:block">
      <div className="auth-panel-bg absolute inset-4 rounded-3xl border border-white/30 dark:border-white/8" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-10 px-8">
        {/* Tagline */}
        <div className="text-center">
          <p className="text-2xl font-semibold tracking-tight text-foreground/90">
            Build AI workflows
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground/40">
            without writing code.
          </p>
        </div>

        <div className="flex -rotate-6 gap-3">
          {cards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className={`w-48 rounded-3xl border bg-gradient-to-b p-4 shadow-[0_18px_40px_rgba(30,41,59,0.18)] transition-all duration-300 ease-out hover:-translate-y-3 hover:shadow-[0_28px_50px_rgba(30,41,59,0.22)] cursor-default ${card.tone} ${idx === 1 ? "mt-[-8px]" : idx === 2 ? "mt-[6px]" : "mt-[2px]"}`}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 dark:bg-white/10 shadow-sm">
                  <Icon className="h-8 w-8" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold leading-tight text-foreground">
                  {card.title}
                </h3>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{card.subtitle}</p>
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>2 skills</span>
                  <BarChart3 className="h-3.5 w-3.5" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </aside>
  );

}

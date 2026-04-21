import { BarChart3, Flower2, Radar, Search } from "lucide-react";

const cards = [
  {
    title: "Competitive Research",
    subtitle: "Generate regular competitor analysis reports",
    icon: Flower2,
    tone: "from-emerald-100 to-emerald-50 text-emerald-700 border-emerald-200/80",
  },
  {
    title: "Lead Qualifier",
    subtitle: "Enrich and qualify incoming leads",
    icon: Radar,
    tone: "from-sky-100 to-blue-50 text-blue-700 border-blue-200/80",
  },
  {
    title: "User Researcher",
    subtitle: "Synthesize feedback into product insights",
    icon: Search,
    tone: "from-orange-100 to-amber-50 text-orange-700 border-orange-200/80",
  },
] as const;

export function AuthVisualPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden lg:block">
      <div className="absolute inset-4 rounded-3xl border border-white/60 bg-[radial-gradient(circle_at_35%_30%,rgba(251,146,60,0.35),transparent_40%),radial-gradient(circle_at_70%_85%,rgba(99,102,241,0.45),transparent_45%),linear-gradient(160deg,#f3f4ff_0%,#eceef9_45%,#dddaf2_100%)]" />
      <div className="relative z-10 flex h-full items-center justify-center px-8">
        <div className="flex -rotate-6 gap-3">
          {cards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className={`w-48 rounded-3xl border bg-gradient-to-b p-4 shadow-[0_18px_40px_rgba(30,41,59,0.18)] ${card.tone} ${idx === 1 ? "mt-[-8px]" : idx === 2 ? "mt-[6px]" : "mt-[2px]"}`}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                  <Icon className="h-8 w-8" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold leading-tight text-zinc-800">
                  {card.title}
                </h3>
                <p className="mt-1 text-xs leading-snug text-zinc-600">{card.subtitle}</p>
                <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-600">
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

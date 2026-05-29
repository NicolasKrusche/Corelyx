"use client";

import { useTheme, type BaseTheme, type AccentColor, type BgStyle } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const ACCENTS: { id: AccentColor; label: string; color: string }[] = [
  { id: "orange", label: "Orange", color: "#f97316" },
  { id: "blue",   label: "Blue",   color: "#3b9eff" },
  { id: "indigo", label: "Indigo", color: "#818cf8" },
  { id: "green",  label: "Green",  color: "#22c55e" },
  { id: "pink",   label: "Pink",   color: "#fb7185" },
  { id: "cyan",   label: "Cyan",   color: "#22d3ee" },
];

const BG_STYLES: { id: BgStyle; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "liquid",  label: "Liquid"  },
  { id: "obsidian", label: "Obsidian" },
  { id: "noir",    label: "Noir"    },
];

function DefaultPreview() {
  return (
    <div className="relative w-9 h-6 rounded overflow-hidden bg-[#171717]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 80% 10%, hsl(var(--theme-glow-strong) / 0.55) 0%, transparent 55%)," +
            "radial-gradient(ellipse 55% 50% at 15% 90%, hsl(var(--theme-glow-soft) / 0.4) 0%, transparent 50%)",
        }}
      />
    </div>
  );
}

function LiquidPreview() {
  return (
    <div
      className="relative w-9 h-6 rounded overflow-hidden"
      style={{ background: "#020209" }}
    >
      {/* dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--theme-glow-soft) / 0.3) 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
      />
      {/* orbs */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 75% 20%, hsl(var(--theme-glow-strong) / 0.75) 0%, transparent 55%)," +
            "radial-gradient(ellipse 45% 40% at 20% 80%, hsl(var(--theme-glow-soft) / 0.55) 0%, transparent 45%)",
        }}
      />
      {/* top highlight sheen */}
      <div
        className="absolute inset-x-0 top-0 h-[35%]"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.07), transparent)" }}
      />
    </div>
  );
}

function ObsidianPreview() {
  return (
    <div
      className="relative w-9 h-6 rounded overflow-hidden"
      style={{ background: "#050505" }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(45deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "7px 7px",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-3.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded"
        style={{
          background: "rgba(255,255,255,0.07)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}

function NoirPreview() {
  return (
    <div className="w-9 h-6 rounded overflow-hidden bg-black" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }} />
  );
}

const PREVIEWS: Record<BgStyle, React.ReactNode> = {
  default: <DefaultPreview />,
  liquid:  <LiquidPreview />,
  obsidian: <ObsidianPreview />,
  noir:    <NoirPreview />,
};

export function ThemePicker() {
  const { base, accent, bgStyle, setBase, setAccent, setBgStyle } = useTheme();

  return (
    <div className="px-3 py-2 space-y-3">
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5">Mode</p>
        <div className="flex gap-1">
          {(["dark", "light"] as BaseTheme[]).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                base === b
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {b === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5">Accent</p>
        <div className="flex flex-wrap gap-1.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              title={a.label}
              onClick={() => setAccent(a.id)}
              className={cn(
                "w-5 h-5 rounded-full transition-all duration-150 shrink-0",
                "ring-offset-background ring-offset-1",
                accent === a.id
                  ? "ring-2 ring-foreground/60 scale-110"
                  : "hover:scale-110 ring-1 ring-border/50"
              )}
              style={{ backgroundColor: a.color }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5">Style</p>
        <div className="flex gap-1.5">
          {BG_STYLES.map((s) => (
            <button
              key={s.id}
              title={s.label}
              onClick={() => setBgStyle(s.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md p-1 transition-colors",
                bgStyle === s.id
                  ? "ring-1 ring-primary/50 bg-primary/10"
                  : "hover:bg-muted"
              )}
            >
              {PREVIEWS[s.id]}
              <span className="text-[9px] text-muted-foreground leading-none">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

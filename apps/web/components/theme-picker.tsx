"use client";

import { useTheme, type BaseTheme, type AccentColor } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const ACCENTS: { id: AccentColor; label: string; color: string }[] = [
  { id: "orange", label: "Orange", color: "#f97316" },
  { id: "blue",   label: "Blue",   color: "#3b9eff" },
  { id: "indigo", label: "Indigo", color: "#818cf8" },
  { id: "green",  label: "Green",  color: "#22c55e" },
  { id: "pink",   label: "Pink",   color: "#fb7185" },
  { id: "cyan",   label: "Cyan",   color: "#22d3ee" },
];

export function ThemePicker() {
  const { base, accent, setBase, setAccent } = useTheme();

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
    </div>
  );
}

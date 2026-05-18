"use client";

import { useEffect, useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CronMode = "simple" | "advanced";
type Frequency = "minutes" | "hours" | "daily" | "weekdays" | "weekly" | "monthly";

export interface CronBuilderProps {
  /** Current cron expression (5-field standard cron) */
  expression: string;
  timezone: string;
  onChange: (expression: string, timezone: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MINUTE_INTERVALS = [5, 10, 15, 20, 30, 45];
const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12];

const WEEKDAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Africa/Cairo",
  "Africa/Johannesburg",
];

// ─── Cron parser / next-runs ──────────────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.includes("/")) {
      const [rangeStr, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      const [rangeStart, rangeEnd] =
        rangeStr === "*"
          ? [min, max]
          : rangeStr.includes("-")
          ? rangeStr.split("-").map(Number)
          : [parseInt(rangeStr, 10), max];
      for (let i = rangeStart; i <= rangeEnd; i += step) result.add(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      for (let i = s; i <= e; i++) result.add(i);
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) result.add(n);
    }
  }
  return result;
}

function nextNRuns(expr: string, n: number): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [minField, hourField, domField, monField, dowField] = parts;

  try {
    const minutes = parseCronField(minField, 0, 59);
    const hours = parseCronField(hourField, 0, 23);
    const doms = parseCronField(domField, 1, 31);
    const months = parseCronField(monField, 1, 12);
    const dows = parseCronField(dowField, 0, 7);
    // Normalize: 7 = Sunday = 0
    if (dows.has(7)) dows.add(0);

    const domRestricted = domField !== "*";
    const dowRestricted = dowField !== "*";

    const results: Date[] = [];
    const candidate = new Date();
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

    let iters = 0;
    while (results.length < n && iters < 20000) {
      iters++;
      const m = candidate.getUTCMinutes();
      const h = candidate.getUTCHours();
      const dom = candidate.getUTCDate();
      const mon = candidate.getUTCMonth() + 1;
      const dow = candidate.getUTCDay();

      const domMatch = doms.has(dom);
      const dowMatch = dows.has(dow);
      const dayMatch =
        domRestricted && dowRestricted
          ? domMatch || dowMatch
          : domRestricted
          ? domMatch
          : dowRestricted
          ? dowMatch
          : true;

      if (months.has(mon) && dayMatch && hours.has(h) && minutes.has(m)) {
        results.push(new Date(candidate));
      }
      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Human-readable description ───────────────────────────────────────────────

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Invalid expression";
  const [min, hour, dom, , dow] = parts;

  if (min.startsWith("*/") && hour === "*" && dom === "*" && dow === "*") {
    const n = min.slice(2);
    return `Every ${n} minute${n === "1" ? "" : "s"}`;
  }
  if (min === "0" && hour.startsWith("*/") && dom === "*" && dow === "*") {
    const n = hour.slice(2);
    return `Every ${n} hour${n === "1" ? "" : "s"}`;
  }
  if (!min.includes("*") && !hour.includes("*")) {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (dom === "*" && dow === "1-5") return `Weekdays at ${timeStr}`;
    if (dom === "*" && dow === "*") return `Daily at ${timeStr}`;
    if (dom === "*" && !dow.includes("-") && !dow.includes(",") && !dow.includes("*")) {
      const dayName = WEEKDAYS.find((d) => d.value === dow)?.label ?? dow;
      return `Every ${dayName} at ${timeStr}`;
    }
    if (!dom.includes("*") && !dom.includes(",") && dow === "*") {
      return `Monthly on day ${dom} at ${timeStr}`;
    }
  }
  return expr; // fall back to raw expression
}

// ─── Cron generator from simple settings ─────────────────────────────────────

interface SimpleSettings {
  frequency: Frequency;
  minuteInterval: number;
  hourInterval: number;
  hour: number;
  minute: number;
  weekday: string; // "0"–"6"
  monthDay: number;
}

function buildExpression(s: SimpleSettings): string {
  const pad = (n: number) => String(n);
  switch (s.frequency) {
    case "minutes": return `*/${s.minuteInterval} * * * *`;
    case "hours":   return `0 */${s.hourInterval} * * *`;
    case "daily":   return `${pad(s.minute)} ${pad(s.hour)} * * *`;
    case "weekdays":return `${pad(s.minute)} ${pad(s.hour)} * * 1-5`;
    case "weekly":  return `${pad(s.minute)} ${pad(s.hour)} * * ${s.weekday}`;
    case "monthly": return `${pad(s.minute)} ${pad(s.hour)} ${s.monthDay} * *`;
    default:        return "0 9 * * *";
  }
}

// Try to reverse-engineer simple settings from a cron expression
function parseSimpleSettings(expr: string): SimpleSettings | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, , dow] = parts;

  const base: SimpleSettings = {
    frequency: "daily",
    minuteInterval: 15,
    hourInterval: 1,
    hour: 9,
    minute: 0,
    weekday: "1",
    monthDay: 1,
  };

  if (/^\*\/\d+$/.test(min) && hour === "*" && dom === "*" && dow === "*") {
    return { ...base, frequency: "minutes", minuteInterval: parseInt(min.slice(2), 10) };
  }
  if (min === "0" && /^\*\/\d+$/.test(hour) && dom === "*" && dow === "*") {
    return { ...base, frequency: "hours", hourInterval: parseInt(hour.slice(2), 10) };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    if (dom === "*" && dow === "1-5") return { ...base, frequency: "weekdays", hour: h, minute: m };
    if (dom === "*" && dow === "*")   return { ...base, frequency: "daily", hour: h, minute: m };
    if (dom === "*" && /^\d+$/.test(dow)) return { ...base, frequency: "weekly", hour: h, minute: m, weekday: dow };
    if (/^\d+$/.test(dom) && dow === "*") return { ...base, frequency: "monthly", hour: h, minute: m, monthDay: parseInt(dom, 10) };
  }
  return null; // expression is too complex for simple mode
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-border bg-background px-2.5 py-1.5 text-sm ${className}`}
    >
      {children}
    </select>
  );
}

function TimePicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select value={hour} onChange={(v) => onHourChange(parseInt(v, 10))}>
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
        ))}
      </Select>
      <span className="text-muted-foreground text-sm font-mono">:</span>
      <Select value={minute} onChange={(v) => onMinuteChange(parseInt(v, 10))}>
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </Select>
    </div>
  );
}

// ─── NextRunsPreview ──────────────────────────────────────────────────────────

function NextRunsPreview({ expression, timezone }: { expression: string; timezone: string }) {
  const runs = useMemo(() => nextNRuns(expression, 5), [expression]);

  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Cannot compute next runs — check the expression.
      </p>
    );
  }

  const fmtOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
        Next 5 runs (approx. UTC · displayed in your browser timezone)
      </p>
      {runs.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-mono">
          <span className="w-4 text-right text-muted-foreground/40">{i + 1}.</span>
          <span>{d.toLocaleString(undefined, fmtOptions)}</span>
        </div>
      ))}
      {timezone !== "UTC" && (
        <p className="text-[11px] text-muted-foreground/50 mt-1">
          ⓘ The backend schedules in <strong>{timezone}</strong>. Times above are approximate UTC projections.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CronBuilder({ expression, timezone, onChange }: CronBuilderProps) {
  const parsed = useMemo(() => parseSimpleSettings(expression), [expression]);
  const [mode, setMode] = useState<CronMode>(parsed ? "simple" : "advanced");
  const [settings, setSettings] = useState<SimpleSettings>(
    parsed ?? {
      frequency: "daily",
      minuteInterval: 15,
      hourInterval: 1,
      hour: 9,
      minute: 0,
      weekday: "1",
      monthDay: 1,
    }
  );
  const [advancedExpr, setAdvancedExpr] = useState(expression);
  const [tz, setTz] = useState(timezone);

  // When simple settings change, emit updated expression
  useEffect(() => {
    if (mode === "simple") {
      onChange(buildExpression(settings), tz);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, tz, mode]);

  function handleModeSwitch(next: CronMode) {
    if (next === "advanced") {
      setAdvancedExpr(mode === "simple" ? buildExpression(settings) : advancedExpr);
    } else {
      // Try to parse current advanced expression into simple settings
      const parsed = parseSimpleSettings(advancedExpr);
      if (parsed) setSettings(parsed);
    }
    setMode(next);
  }

  function updateSetting<K extends keyof SimpleSettings>(key: K, value: SimpleSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const currentExpression = mode === "simple" ? buildExpression(settings) : advancedExpr;
  const description = describeCron(currentExpression);

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {(["simple", "advanced"] as CronMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeSwitch(m)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
              mode === m
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Simple mode */}
      {mode === "simple" && (
        <div className="space-y-3">
          {/* Frequency */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-muted-foreground w-16 shrink-0">Frequency</label>
            <Select
              value={settings.frequency}
              onChange={(v) => updateSetting("frequency", v as Frequency)}
            >
              <option value="minutes">Every N minutes</option>
              <option value="hours">Every N hours</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </div>

          {/* Interval (minutes) */}
          {settings.frequency === "minutes" && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Every</label>
              <Select
                value={settings.minuteInterval}
                onChange={(v) => updateSetting("minuteInterval", parseInt(v, 10))}
              >
                {MINUTE_INTERVALS.map((n) => (
                  <option key={n} value={n}>{n} minutes</option>
                ))}
              </Select>
            </div>
          )}

          {/* Interval (hours) */}
          {settings.frequency === "hours" && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Every</label>
              <Select
                value={settings.hourInterval}
                onChange={(v) => updateSetting("hourInterval", parseInt(v, 10))}
              >
                {HOUR_INTERVALS.map((n) => (
                  <option key={n} value={n}>{n} hour{n === 1 ? "" : "s"}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Weekly day picker */}
          {settings.frequency === "weekly" && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Day</label>
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => updateSetting("weekday", d.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      settings.weekday === d.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly day picker */}
          {settings.frequency === "monthly" && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Day</label>
              <Select
                value={settings.monthDay}
                onChange={(v) => updateSetting("monthDay", parseInt(v, 10))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : `${d}th`}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted-foreground">of the month</span>
            </div>
          )}

          {/* Time picker (for date-based frequencies) */}
          {["daily", "weekdays", "weekly", "monthly"].includes(settings.frequency) && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground w-16 shrink-0">At</label>
              <TimePicker
                hour={settings.hour}
                minute={settings.minute}
                onHourChange={(h) => updateSetting("hour", h)}
                onMinuteChange={(m) => updateSetting("minute", m)}
              />
            </div>
          )}
        </div>
      )}

      {/* Advanced mode */}
      {mode === "advanced" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-16 shrink-0">Expression</label>
            <input
              type="text"
              value={advancedExpr}
              onChange={(e) => {
                setAdvancedExpr(e.target.value);
                onChange(e.target.value, tz);
              }}
              placeholder="0 9 * * 1-5"
              spellCheck={false}
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono min-w-0"
            />
          </div>
          <p className="text-xs text-muted-foreground pl-[76px]">
            Standard 5-field cron: <code className="font-mono">minute hour day month weekday</code>
          </p>
        </div>
      )}

      {/* Timezone */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-muted-foreground w-16 shrink-0">Timezone</label>
        <Select value={tz} onChange={(v) => { setTz(v); onChange(currentExpression, v); }}>
          {COMMON_TIMEZONES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>

      {/* Summary + next runs */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
        {/* Human-readable summary */}
        <div className="flex items-start gap-2">
          <span className="text-[11px] font-mono bg-muted rounded px-1.5 py-0.5 text-muted-foreground shrink-0">
            {currentExpression}
          </span>
          <span className="text-xs text-muted-foreground">— {description}</span>
        </div>

        <NextRunsPreview expression={currentExpression} timezone={tz} />
      </div>
    </div>
  );
}

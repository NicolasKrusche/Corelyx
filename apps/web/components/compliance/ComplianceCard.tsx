"use client";

import { ShieldCheck, ShieldAlert, ShieldX, Shield, Eye, FileText, Activity, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComplianceRiskLevel } from "@/lib/compliance/risk-classifier";

// ─── Risk level configuration ───────────────────────────────────────────────

const RISK_CONFIG: Record<
  ComplianceRiskLevel,
  {
    label: string;
    badge: string;
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  minimal: {
    label: "Minimal Risk",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: ShieldCheck,
    bgClass: "bg-emerald-50 dark:bg-emerald-950/20",
    textClass: "text-emerald-700 dark:text-emerald-400",
    borderClass: "border-emerald-200 dark:border-emerald-800/50",
  },
  limited: {
    label: "Limited Risk",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: Shield,
    bgClass: "bg-amber-50 dark:bg-amber-950/20",
    textClass: "text-amber-700 dark:text-amber-400",
    borderClass: "border-amber-200 dark:border-amber-800/50",
  },
  high: {
    label: "High Risk",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    icon: ShieldAlert,
    bgClass: "bg-orange-50 dark:bg-orange-950/20",
    textClass: "text-orange-700 dark:text-orange-400",
    borderClass: "border-orange-200 dark:border-orange-800/50",
  },
  unacceptable: {
    label: "Unacceptable",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: ShieldX,
    bgClass: "bg-red-50 dark:bg-red-950/20",
    textClass: "text-red-700 dark:text-red-400",
    borderClass: "border-red-200 dark:border-red-800/50",
  },
};

// ─── Compliance indicators ──────────────────────────────────────────────────

export type ComplianceIndicators = {
  dataResidency: boolean;
  humanOversight: boolean;
  transparency: boolean;
  auditTrail: boolean;
};

function Indicator({
  label,
  active,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full",
          active
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
            : "bg-muted text-muted-foreground/40"
        )}
      >
        <Icon className="h-3 w-3" />
      </div>
      <span
        className={cn(
          "text-xs",
          active ? "text-foreground" : "text-muted-foreground/50"
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Score ring ─────────────────────────────────────────────────────────────

function ScoreRing({ score, level }: { score: number; level: ComplianceRiskLevel }) {
  const config = RISK_CONFIG[level];
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r="28" fill="none" className="stroke-muted" strokeWidth="4" />
        <circle
          cx="36"
          cy="36"
          r="28"
          fill="none"
          className={cn(
            "stroke-current",
            config.textClass
          )}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold tabular-nums", config.textClass)}>
          {score}
        </span>
      </div>
    </div>
  );
}

// ─── ComplianceCard ─────────────────────────────────────────────────────────

export type ComplianceCardProps = {
  programId: string;
  programName: string;
  riskLevel: ComplianceRiskLevel;
  riskScore: number;
  indicators: ComplianceIndicators;
  factorsCount: number;
  lastAssessed?: string;
  onExportDpia?: (programId: string) => void;
  onExportRopa?: (programId: string) => void;
  className?: string;
};

export function ComplianceCard({
  programId,
  programName,
  riskLevel,
  riskScore,
  indicators,
  factorsCount,
  lastAssessed,
  onExportDpia,
  onExportRopa,
  className,
}: ComplianceCardProps) {
  const config = RISK_CONFIG[riskLevel];
  const RiskIcon = config.icon;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-5 transition-all hover:shadow-md",
        config.borderClass,
        className
      )}
    >
      {/* Subtle top accent */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5", config.bgClass)} />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {programName}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ID: {programId.slice(0, 8)}…
          </p>
        </div>
        <ScoreRing score={riskScore} level={riskLevel} />
      </div>

      {/* Risk badge */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            config.badge
          )}
        >
          <RiskIcon className="h-3 w-3" />
          {config.label}
        </span>
        {factorsCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {factorsCount} factor{factorsCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Compliance indicators */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Indicator label="Data Residency" active={indicators.dataResidency} icon={Eye} />
        <Indicator label="Human Oversight" active={indicators.humanOversight} icon={CheckCircle2} />
        <Indicator label="Transparency" active={indicators.transparency} icon={FileText} />
        <Indicator label="Audit Trail" active={indicators.auditTrail} icon={Activity} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-[10px] text-muted-foreground">
          {lastAssessed
            ? `Last assessed: ${new Date(lastAssessed).toLocaleDateString()}`
            : "Not yet assessed"}
        </span>
        <div className="flex gap-1.5">
          {onExportDpia && (
            <button
              onClick={() => onExportDpia(programId)}
              className="rounded-md bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              DPIA
            </button>
          )}
          {onExportRopa && (
            <button
              onClick={() => onExportRopa(programId)}
              className="rounded-md bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              ROPA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

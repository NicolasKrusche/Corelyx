"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { CINE_TITLE } from "@/components/cinematic";
import { ComplianceCard, type ComplianceIndicators } from "@/components/compliance/ComplianceCard";
import { cn } from "@/lib/utils";
import type { ComplianceRiskLevel } from "@/lib/compliance/risk-classifier";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProgramSummary = {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string | null;
  ai_act_risk_level?: string | null;
  human_oversight_required?: boolean | null;
  transparency_notice_required?: boolean | null;
  high_risk_documentation_required?: boolean | null;
};

type AssessmentResult = {
  programId: string;
  level: ComplianceRiskLevel;
  score: number;
  factorsCount: number;
  assessedAt: string;
};

type WorkspaceStats = {
  totalPrograms: number;
  assessedPrograms: number;
  riskDistribution: Record<ComplianceRiskLevel, number>;
  averageScore: number;
};

// ─── Risk level display helpers ─────────────────────────────────────────────

function riskLevelFromAiActLevel(level: string | null | undefined): ComplianceRiskLevel {
  if (level === "prohibited") return "unacceptable";
  if (level === "high_risk") return "high";
  if (level === "transparency") return "limited";
  if (level === "gpai_related" || level === "limited_or_minimal") return "limited";
  return "minimal";
}

const RISK_SUMMARY_CONFIG: Record<
  ComplianceRiskLevel,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    textClass: string;
    bgClass: string;
  }
> = {
  minimal: { label: "Minimal", icon: ShieldCheck, textClass: "text-emerald-600", bgClass: "bg-emerald-50 dark:bg-emerald-950/20" },
  limited: { label: "Limited", icon: Shield, textClass: "text-amber-600", bgClass: "bg-amber-50 dark:bg-amber-950/20" },
  high: { label: "High", icon: ShieldAlert, textClass: "text-orange-600", bgClass: "bg-orange-50 dark:bg-orange-950/20" },
  unacceptable: { label: "Unacceptable", icon: ShieldX, textClass: "text-red-600", bgClass: "bg-red-50 dark:bg-red-950/20" },
};

// ─── Stats metric card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border glass-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">{caption}</p>
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ComplianceDashboardPage() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [assessments, setAssessments] = useState<Record<string, AssessmentResult>>({});
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState<string | null>(null);

  // Load programs
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/compliance/assess", { method: "POST", body: JSON.stringify({ action: "list_programs" }) });
        if (res.ok) {
          const data = await res.json();
          setPrograms(data.programs ?? []);
        }
      } catch {
        // Silently handle — the page shows empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Assess a single program
  const assessProgram = useCallback(async (programId: string) => {
    setAssessing(programId);
    try {
      const res = await fetch("/api/compliance/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programId }),
      });
      if (res.ok) {
        const data = await res.json();
        setAssessments((prev) => ({
          ...prev,
          [programId]: {
            programId,
            level: data.level,
            score: data.score,
            factorsCount: data.factors?.length ?? 0,
            assessedAt: data.assessedAt,
          },
        }));
      }
    } catch {
      // ignore
    } finally {
      setAssessing(null);
    }
  }, []);

  // Assess all programs
  const assessAll = useCallback(async () => {
    for (const p of programs) {
      await assessProgram(p.id);
    }
  }, [programs, assessProgram]);

  // Export DPIA
  const exportDpia = useCallback(async (programId: string) => {
    try {
      const res = await fetch(`/api/compliance/dpia/${programId}`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dpia-${programId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    }
  }, []);

  // Export ROPA
  const exportRopa = useCallback(async (programId: string) => {
    try {
      const res = await fetch(`/api/compliance/ropa/${programId}`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ropa-${programId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    }
  }, []);

  // Compute workspace stats
  const stats: WorkspaceStats = {
    totalPrograms: programs.length,
    assessedPrograms: Object.keys(assessments).length,
    riskDistribution: { minimal: 0, limited: 0, high: 0, unacceptable: 0 },
    averageScore: 0,
  };

  const assessmentValues = Object.values(assessments);
  if (assessmentValues.length > 0) {
    for (const a of assessmentValues) {
      stats.riskDistribution[a.level]++;
    }
    stats.averageScore = Math.round(
      assessmentValues.reduce((sum, a) => sum + a.score, 0) / assessmentValues.length
    );
  }

  // Derive indicators for a program
  function getIndicators(program: ProgramSummary): ComplianceIndicators {
    return {
      dataResidency: true, // Corelyx defaults to EU
      humanOversight: program.human_oversight_required === true,
      transparency: program.transparency_notice_required === true,
      auditTrail: true, // Corelyx logs all execution
    };
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* Page header — the governance layout already renders the section eyebrow */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className={cn("text-2xl", CINE_TITLE)}>AI Act Readiness Score</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              EU AI Act risk classification, DPIA readiness, and ROPA export for each program.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={assessAll}
              disabled={loading || programs.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", assessing && "animate-spin")} />
              Assess All
            </button>
          </div>
        </div>
      </div>

      {/* Workspace summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Programs"
          value={stats.totalPrograms}
          caption="Active programs in workspace"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="Assessed"
          value={`${stats.assessedPrograms}/${stats.totalPrograms}`}
          caption="Programs with risk assessment"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Average Risk Score"
          value={stats.averageScore || "—"}
          caption="Across all assessed programs"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="High / Unacceptable"
          value={stats.riskDistribution.high + stats.riskDistribution.unacceptable}
          caption="Programs requiring attention"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {/* Risk distribution bar */}
      {stats.assessedPrograms > 0 && (
        <div className="rounded-xl border glass-card p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Risk Distribution
          </p>
          <div className="flex gap-1 overflow-hidden rounded-full">
            {(["minimal", "limited", "high", "unacceptable"] as const).map((level) => {
              const count = stats.riskDistribution[level];
              const pct = (count / stats.assessedPrograms) * 100;
              const cfg = RISK_SUMMARY_CONFIG[level];
              return pct > 0 ? (
                <div
                  key={level}
                  className={cn("flex items-center justify-center py-1.5 text-[10px] font-semibold text-white", cfg.bgClass)}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? "2rem" : 0 }}
                  title={`${cfg.label}: ${count}`}
                >
                  {pct > 10 && count}
                </div>
              ) : null;
            })}
          </div>
          <div className="mt-2 flex gap-4">
            {(["minimal", "limited", "high", "unacceptable"] as const).map((level) => {
              const cfg = RISK_SUMMARY_CONFIG[level];
              const Icon = cfg.icon;
              return (
                <div key={level} className="flex items-center gap-1.5">
                  <Icon className={cn("h-3 w-3", cfg.textClass)} />
                  <span className="text-[10px] text-muted-foreground">
                    {cfg.label}: {stats.riskDistribution[level]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Program cards grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Programs</h2>
          <div className="flex gap-2">
            <Link
              href="/governance/dpia"
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <FileText className="h-3 w-3" />
              DPIA Templates
            </Link>
            <Link
              href="/governance/exports"
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <Download className="h-3 w-3" />
              All Exports
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        ) : programs.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No programs found</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Create a program in the editor to see its compliance assessment here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => {
              const assessment = assessments[program.id];
              const level = assessment?.level ?? riskLevelFromAiActLevel(program.ai_act_risk_level);
              const score = assessment?.score ?? 0;

              return (
                <ComplianceCard
                  key={program.id}
                  programId={program.id}
                  programName={program.name}
                  riskLevel={level}
                  riskScore={score}
                  indicators={getIndicators(program)}
                  factorsCount={assessment?.factorsCount ?? 0}
                  lastAssessed={assessment?.assessedAt}
                  onExportDpia={exportDpia}
                  onExportRopa={exportRopa}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
